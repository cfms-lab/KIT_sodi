"""Live 3D Polyscope view of the graph embedded in ``graph.html``.

The HTML is the source of truth. Every launch, and every live reload, reads the
current RAW_NODES, RAW_EDGES, POS, hyperedges, and FINDING_DEPS values. The
XY layout is preserved by a uniform scale/translation; Z is always the number
of unique neighbors of the node.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from scipy.spatial import ConvexHull


DEFAULT_LAYOUT_SCALE = 60.0  # graph.html pixels per Polyscope world unit
DEFAULT_EDGE_COLOR = (0.55, 0.55, 0.58)


def _balanced_literal(text: str, start: int) -> str:
    """Return a balanced JS object/array literal beginning at or after start."""
    opening = -1
    for i in range(start, len(text)):
        if text[i] in "[{":
            opening = i
            break
        if not text[i].isspace() and text[i] not in "=(,":
            raise ValueError(f"Expected an object or array near character {i}")
    if opening < 0:
        raise ValueError("Object/array literal was not found")

    pairs = {"[": "]", "{": "}"}
    stack: list[str] = []
    quote: str | None = None
    escaped = False
    for i in range(opening, len(text)):
        ch = text[i]
        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch in pairs:
            stack.append(pairs[ch])
        elif ch in "]}":
            if not stack or ch != stack.pop():
                raise ValueError(f"Unbalanced literal near character {i}")
            if not stack:
                return text[opening : i + 1]
    raise ValueError("Unterminated object/array literal")


def _const_literal(text: str, name: str, *, required: bool = True) -> str | None:
    match = re.search(rf"\bconst\s+{re.escape(name)}\s*=", text)
    if match is None:
        if required:
            raise ValueError(f"graph.html does not define const {name}")
        return None
    return _balanced_literal(text, match.end())


def _json_const(text: str, name: str, *, required: bool = True) -> Any:
    literal = _const_literal(text, name, required=required)
    if literal is None:
        return None
    try:
        return json.loads(literal)
    except json.JSONDecodeError as exc:
        raise ValueError(f"const {name} is not valid JSON: {exc}") from exc


def _js_object_array(text: str, name: str) -> list[dict[str, Any]]:
    """Parse the small JS object-array syntax used by FINDING_DEPS."""
    literal = _const_literal(text, name, required=False)
    if literal is None:
        return []
    quoted = re.sub(
        r"([,{]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)",
        r'\1"\2"\3',
        literal,
    )
    quoted = re.sub(r",\s*([}\]])", r"\1", quoted)
    try:
        value = json.loads(quoted)
    except json.JSONDecodeError:
        return []
    return value if isinstance(value, list) else []


def _effective_positions(text: str) -> dict[str, dict[str, float]]:
    positions = dict(_json_const(text, "POS"))
    pattern = re.compile(r"Object\.assign\s*\(\s*POS\s*,")
    for match in pattern.finditer(text):
        try:
            override = json.loads(_balanced_literal(text, match.end()))
        except (ValueError, json.JSONDecodeError):
            continue
        positions.update(override)
    return positions


def _hex_rgb(value: Any, fallback: tuple[float, float, float] = DEFAULT_EDGE_COLOR) -> tuple[float, float, float]:
    if not isinstance(value, str):
        return fallback
    value = value.strip().lower()
    named = {"black": "#000000", "white": "#ffffff"}
    value = named.get(value, value)
    if not value.startswith("#"):
        return fallback
    raw = value[1:]
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return fallback
    try:
        return tuple(int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return fallback


def _lighten_half(color: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple((channel + 1.0) * 0.5 for channel in color)


@dataclass
class GraphModel:
    html_path: Path
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    positions: dict[str, dict[str, float]]
    hyperedges: list[dict[str, Any]]
    finding_deps: list[dict[str, Any]]
    layout_scale: float
    ids: list[str]
    id_to_index: dict[str, int]
    html_xy: np.ndarray
    points: np.ndarray
    degrees: np.ndarray
    node_radii: np.ndarray
    node_colors: np.ndarray
    degree_mismatches: dict[str, tuple[int, int]]


@dataclass
class HyperedgeHull:
    vertices: np.ndarray
    faces: np.ndarray
    centroid: np.ndarray
    equations: np.ndarray


def load_graph(html_path: Path, layout_scale: float = DEFAULT_LAYOUT_SCALE) -> GraphModel:
    if layout_scale <= 0:
        raise ValueError("layout_scale must be positive")
    text = html_path.read_text(encoding="utf-8-sig")
    nodes = list(_json_const(text, "RAW_NODES"))
    edges = list(_json_const(text, "RAW_EDGES"))
    positions = _effective_positions(text)
    hyperedges = list(_json_const(text, "hyperedges", required=False) or [])
    finding_deps = _js_object_array(text, "FINDING_DEPS")

    ids = [str(node["id"]) for node in nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("RAW_NODES contains duplicate node IDs")
    id_to_index = {node_id: i for i, node_id in enumerate(ids)}
    missing_positions = [node_id for node_id in ids if node_id not in positions]
    if missing_positions:
        preview = ", ".join(missing_positions[:8])
        raise ValueError(f"POS is missing {len(missing_positions)} node(s): {preview}")

    neighbors = {node_id: set() for node_id in ids}
    bad_edges: list[str] = []
    for edge in edges:
        source, target = str(edge.get("from")), str(edge.get("to"))
        if source not in id_to_index or target not in id_to_index:
            bad_edges.append(f"{source}->{target}")
            continue
        if source != target:
            neighbors[source].add(target)
            neighbors[target].add(source)
    if bad_edges:
        raise ValueError(f"RAW_EDGES has missing endpoints: {', '.join(bad_edges[:8])}")

    for hyperedge in hyperedges:
        missing = [str(n) for n in hyperedge.get("nodes", []) if str(n) not in id_to_index]
        if missing:
            raise ValueError(f"Hyperedge {hyperedge.get('label', '?')} has missing nodes: {', '.join(missing)}")

    html_xy = np.asarray(
        [[float(positions[node_id]["x"]), float(positions[node_id]["y"])] for node_id in ids],
        dtype=float,
    )
    lo = html_xy.min(axis=0)
    hi = html_xy.max(axis=0)
    center = (lo + hi) * 0.5
    degrees = np.asarray([len(neighbors[node_id]) for node_id in ids], dtype=float)
    points = np.column_stack(
        (
            (html_xy[:, 0] - center[0]) / layout_scale,
            -(html_xy[:, 1] - center[1]) / layout_scale,
            degrees,
        )
    )
    node_radii = np.asarray(
        [max(8.0, float(node.get("size", 13.0))) / layout_scale for node in nodes],
        dtype=float,
    )
    node_colors = np.asarray(
        [_hex_rgb((node.get("color") or {}).get("background"), (0.75, 0.75, 0.75)) for node in nodes],
        dtype=float,
    )
    mismatches: dict[str, tuple[int, int]] = {}
    for node_id, node, degree in zip(ids, nodes, degrees, strict=True):
        if node.get("degree") is None:
            continue
        stored = int(node["degree"])
        computed = int(degree)
        if stored != computed:
            mismatches[node_id] = (stored, computed)

    return GraphModel(
        html_path=html_path,
        nodes=nodes,
        edges=edges,
        positions=positions,
        hyperedges=hyperedges,
        finding_deps=finding_deps,
        layout_scale=layout_scale,
        ids=ids,
        id_to_index=id_to_index,
        html_xy=html_xy,
        points=points,
        degrees=degrees,
        node_radii=node_radii,
        node_colors=node_colors,
        degree_mismatches=mismatches,
    )


def _hyperedge_hull(model: GraphModel, hyperedge: dict[str, Any]) -> HyperedgeHull:
    """Return a non-degenerate 3D hull enclosing every member node sphere."""
    member_indices = [model.id_to_index[str(node_id)] for node_id in hyperedge.get("nodes", [])]
    if not member_indices:
        raise ValueError("A hyperedge must contain at least one node")

    # Sampling the sphere shells makes one-, two-, and three-node hyperedges
    # full 3D volumes instead of degenerate points, lines, or planes.
    directions = np.asarray(
        [
            (x, y, z)
            for x in (-1.0, 0.0, 1.0)
            for y in (-1.0, 0.0, 1.0)
            for z in (-1.0, 0.0, 1.0)
            if (x, y, z) != (0.0, 0.0, 0.0)
        ],
        dtype=float,
    )
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    direction_hull = ConvexHull(directions)
    unit_inradius = float(
        np.min(
            -direction_hull.equations[:, 3]
            / np.linalg.norm(direction_hull.equations[:, :3], axis=1)
        )
    )

    centers = model.points[member_indices]
    span = float(np.linalg.norm(np.ptp(centers, axis=0))) if len(centers) > 1 else 0.0
    html_scale = max(1.0, float(hyperedge.get("scale", 1.25)))
    padding = max(0.06, (html_scale - 1.0) * max(span, 1.0) * 0.08)
    shell_points = np.concatenate(
        [
            center
            + directions
            * ((model.node_radii[node_index] * 1.08 + padding) / unit_inradius)
            for center, node_index in zip(centers, member_indices, strict=True)
        ],
        axis=0,
    )

    hull = ConvexHull(shell_points)
    used = np.unique(hull.simplices)
    remap = np.full(len(shell_points), -1, dtype=np.int32)
    remap[used] = np.arange(len(used), dtype=np.int32)
    return HyperedgeHull(
        vertices=shell_points[used],
        faces=remap[hull.simplices].astype(np.int32, copy=False),
        centroid=centers.mean(axis=0),
        equations=hull.equations.copy(),
    )


def _hull_ray_distance(hull: HyperedgeHull, direction: np.ndarray) -> float:
    """Distance from an interior centroid to the hull along ``direction``."""
    denominators = hull.equations[:, :3] @ direction
    valid = denominators > 1e-10
    if not np.any(valid):
        return 0.0
    numerators = -(hull.equations[:, :3] @ hull.centroid + hull.equations[:, 3])
    distances = numerators[valid] / denominators[valid]
    positive = distances[distances >= 0.0]
    return float(positive.min()) if len(positive) else 0.0


def _dash_segment(a: np.ndarray, b: np.ndarray, dash: float, gap: float) -> list[tuple[np.ndarray, np.ndarray]]:
    delta = b - a
    length = float(np.linalg.norm(delta))
    if length <= 1e-12:
        return []
    direction = delta / length
    result: list[tuple[np.ndarray, np.ndarray]] = []
    distance = 0.0
    while distance < length:
        end = min(distance + dash, length)
        result.append((a + direction * distance, a + direction * end))
        distance = end + gap
    return result


def _polyline_segments(points: np.ndarray, closed: bool, dash_pattern: list[float] | None) -> list[tuple[np.ndarray, np.ndarray]]:
    pairs: list[tuple[np.ndarray, np.ndarray]] = []
    count = len(points) if closed else len(points) - 1
    for i in range(max(0, count)):
        a = points[i]
        b = points[(i + 1) % len(points)]
        if dash_pattern:
            pairs.extend(_dash_segment(a, b, dash_pattern[0], dash_pattern[1]))
        else:
            pairs.append((a, b))
    return pairs


def _segment_arrays(segments: list[tuple[np.ndarray, np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    vertices = np.asarray([point for segment in segments for point in segment], dtype=float)
    edges = np.arange(len(vertices), dtype=np.int32).reshape((-1, 2))
    return vertices, edges


def _cone(
    tip: np.ndarray,
    direction: np.ndarray,
    length: float,
    radius: float,
    sides: int = 10,
) -> tuple[list[np.ndarray], list[tuple[int, int, int]]]:
    direction = direction / np.linalg.norm(direction)
    helper = np.array((0.0, 0.0, 1.0))
    if abs(float(np.dot(helper, direction))) > 0.9:
        helper = np.array((0.0, 1.0, 0.0))
    u = np.cross(direction, helper)
    u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    base_center = tip - direction * length
    vertices = [tip, base_center]
    for i in range(sides):
        angle = 2.0 * math.pi * i / sides
        vertices.append(base_center + radius * (math.cos(angle) * u + math.sin(angle) * v))
    faces: list[tuple[int, int, int]] = []
    for i in range(sides):
        current = 2 + i
        nxt = 2 + ((i + 1) % sides)
        faces.append((0, current, nxt))
        faces.append((1, nxt, current))
    return vertices, faces


def _add_to_group(structure: Any, group: Any) -> None:
    try:
        structure.add_to_group(group)
    except Exception:
        pass


def _make_group(ps: Any, name: str) -> Any:
    try:
        group = ps.create_group(name)
        group.set_show_child_details(False)
        return group
    except Exception:
        return name


@dataclass
class SceneLabels:
    node_anchors: list[tuple[np.ndarray, str]] = field(default_factory=list)
    hyperedge_anchors: list[tuple[np.ndarray, str, tuple[float, float, float]]] = field(default_factory=list)
    dependency_anchors: list[tuple[np.ndarray, str]] = field(default_factory=list)


def register_scene(ps: Any, model: GraphModel) -> SceneLabels:
    """Register a complete scene. No node/edge count is assumed."""
    labels = SceneLabels()
    hyper_group = _make_group(ps, "Hyperedges")
    graph_group = _make_group(ps, "Directed graph")
    guide_group = _make_group(ps, "Degree height guides")

    hyperedge_hulls: list[HyperedgeHull | None] = []
    for index, hyperedge in enumerate(model.hyperedges):
        if not hyperedge.get("nodes"):
            hyperedge_hulls.append(None)
            continue
        hull = _hyperedge_hull(model, hyperedge)
        hyperedge_hulls.append(hull)
        label = str(hyperedge.get("label", f"hyperedge {index + 1}"))
        fill_alpha = min(0.24, max(0.08, float(hyperedge.get("fillAlpha", 0.12))))
        mesh = ps.register_surface_mesh(
            f"Hyperedge {index + 1:02d} 3D hull - {label}",
            hull.vertices,
            hull.faces,
            smooth_shade=True,
            edge_width=0.0,
            material="wax",
        )
        mesh.set_transparency(fill_alpha)
        _add_to_group(mesh, hyper_group)

        top = hull.vertices[int(np.argmax(hull.vertices[:, 2]))].copy()
        top[2] += max(0.12, float(model.node_radii.max()) * 0.5)
        label_color = tuple(float(channel) for channel in mesh.get_color())
        labels.hyperedge_anchors.append((top, label, label_color))

    # Reproduce the HTML's arrows between the first discovery hyperedges.
    for dep_index, dep in enumerate(model.finding_deps):
        source_i, target_i = int(dep.get("from", -1)), int(dep.get("to", -1))
        if not (0 <= source_i < len(model.hyperedges) and 0 <= target_i < len(model.hyperedges)):
            continue
        source_hull = hyperedge_hulls[source_i]
        target_hull = hyperedge_hulls[target_i]
        if source_hull is None or target_hull is None:
            continue
        a = source_hull.centroid
        b = target_hull.centroid
        delta = b - a
        length = float(np.linalg.norm(delta))
        if length <= 1e-9:
            continue
        direction = delta / length
        clearance = 8.0 / model.layout_scale
        trim_a = _hull_ray_distance(source_hull, direction) + clearance
        trim_b = _hull_ray_distance(target_hull, -direction) + clearance
        if trim_a + trim_b >= length * 0.9:
            trim_a = length * 0.25
            trim_b = length * 0.25
        start = a + direction * trim_a
        end = b - direction * trim_b
        style = str(dep.get("style", "solid"))
        color = _hex_rgb("#8a8a5e" if style == "contrast" else "#a5a8f5")
        html_patterns = {
            "dotted": (4.0, 10.0),
            "double": (22.0, 14.0),
            "contrast": (10.0, 12.0),
            "solid": (14.0, 10.0),
        }
        dash, gap = html_patterns.get(style, html_patterns["solid"])
        segments = _dash_segment(start, end, dash / model.layout_scale, gap / model.layout_scale)
        vertices, edge_ids = _segment_arrays(segments)
        curve = ps.register_curve_network(
            f"Finding dependency {dep_index + 1:02d}",
            vertices,
            edge_ids,
            color=color,
            material="flat",
        )
        html_width = 15.0 if style == "double" else 8.0
        curve.set_radius(0.5 * html_width / model.layout_scale, relative=False)
        curve.set_transparency(0.22)
        _add_to_group(curve, hyper_group)

        if style != "contrast":
            arrow_size = (34.0 if style == "double" else 26.0) / model.layout_scale
            arrow_vertices, arrow_faces = _cone(end, direction, arrow_size, arrow_size * 0.45)
            arrow = ps.register_surface_mesh(
                f"Finding dependency {dep_index + 1:02d} arrow",
                np.asarray(arrow_vertices, dtype=float),
                np.asarray(arrow_faces, dtype=np.int32),
                color=color,
                material="wax",
                smooth_shade=True,
                edge_width=0.0,
            )
            arrow.set_transparency(0.32)
            _add_to_group(arrow, hyper_group)
        t = float(dep.get("labelT", 0.5))
        anchor = start + (end - start) * t
        anchor[2] += max(0.12, 6.0 / model.layout_scale)
        labels.dependency_anchors.append((anchor, str(dep.get("label", ""))))

    # Graph edges, preserving directedness, source-node color, width, and dashes.
    solid_segments: list[tuple[np.ndarray, np.ndarray]] = []
    dashed_segments: list[tuple[np.ndarray, np.ndarray]] = []
    solid_colors: list[tuple[float, float, float]] = []
    dashed_colors: list[tuple[float, float, float]] = []
    solid_radii: list[float] = []
    dashed_radii: list[float] = []
    cone_vertices: list[np.ndarray] = []
    cone_faces: list[tuple[int, int, int]] = []
    cone_face_colors: list[tuple[float, float, float]] = []

    dark_borders = {"#000000", "#000", "black", "#374151"}
    for edge in model.edges:
        source_i = model.id_to_index[str(edge["from"])]
        target_i = model.id_to_index[str(edge["to"])]
        source = model.points[source_i]
        target = model.points[target_i]
        delta = target - source
        length = float(np.linalg.norm(delta))
        if length <= 1e-12:
            continue
        border = str((model.nodes[source_i].get("color") or {}).get("border", "")).strip().lower()
        color = _hex_rgb(border, model.node_colors[source_i])
        if border in dark_borders:
            color = _lighten_half(color)
        radius = max(0.012, 0.5 * float(edge.get("width", 2.0)) / model.layout_scale)
        is_dashed = bool(edge.get("dashes"))
        if is_dashed:
            raw_dash = edge.get("dashes")
            if isinstance(raw_dash, list) and len(raw_dash) >= 2:
                dash = max(0.04, float(raw_dash[0]) / model.layout_scale)
                gap = max(0.04, float(raw_dash[1]) / model.layout_scale)
            else:
                dash, gap = 12.0 / model.layout_scale, 8.0 / model.layout_scale
            parts = _dash_segment(source, target, dash, gap)
            dashed_segments.extend(parts)
            dashed_colors.extend([color] * len(parts))
            dashed_radii.extend([radius] * len(parts))
        else:
            solid_segments.append((source, target))
            solid_colors.append(color)
            solid_radii.append(radius)

        direction = delta / length
        tip = target - direction * (model.node_radii[target_i] * 1.08)
        arrow_length = max(0.28, radius * 8.0)
        arrow_radius = max(0.10, radius * 3.8)
        vertices, faces = _cone(tip, direction, arrow_length, arrow_radius)
        base = len(cone_vertices)
        cone_vertices.extend(vertices)
        cone_faces.extend((base + a, base + b, base + c) for a, b, c in faces)
        cone_face_colors.extend([color] * len(faces))

    def register_edge_set(
        name: str,
        segments: list[tuple[np.ndarray, np.ndarray]],
        colors: list[tuple[float, float, float]],
        radii: list[float],
    ) -> None:
        if not segments:
            return
        vertices, edge_ids = _segment_arrays(segments)
        curve = ps.register_curve_network(name, vertices, edge_ids, color=DEFAULT_EDGE_COLOR, material="flat")
        curve.add_scalar_quantity("HTML edge radius", np.asarray(radii), defined_on="edges", enabled=False)
        curve.set_edge_radius_quantity("HTML edge radius", autoscale=False)
        curve.add_color_quantity("Source-node edge color", np.asarray(colors), defined_on="edges", enabled=True)
        curve.set_transparency(0.7)
        _add_to_group(curve, graph_group)

    register_edge_set("Graph edges - solid", solid_segments, solid_colors, solid_radii)
    register_edge_set("Graph edges - dashed", dashed_segments, dashed_colors, dashed_radii)

    if cone_vertices:
        arrows = ps.register_surface_mesh(
            "Directed arrowheads",
            np.asarray(cone_vertices),
            np.asarray(cone_faces, dtype=np.int32),
            color=DEFAULT_EDGE_COLOR,
            smooth_shade=False,
            edge_width=0.0,
            material="flat",
        )
        arrows.add_color_quantity("Source-node arrow color", np.asarray(cone_face_colors), defined_on="faces", enabled=True)
        arrows.set_transparency(0.78)
        _add_to_group(arrows, graph_group)

    # Subtle vertical guides make the exact Degree height immediately legible.
    stem_segments: list[tuple[np.ndarray, np.ndarray]] = []
    for point, radius in zip(model.points, model.node_radii, strict=True):
        top_z = max(0.12, point[2] - radius * 0.9)
        stem_segments.append((np.array((point[0], point[1], 0.12)), np.array((point[0], point[1], top_z))))
    stem_vertices, stem_edges = _segment_arrays(stem_segments)
    stems = ps.register_curve_network("Degree stems (ground to z=degree)", stem_vertices, stem_edges, color=(0.45, 0.45, 0.48), material="flat")
    stems.set_radius(0.012, relative=False)
    stems.set_transparency(0.22)
    _add_to_group(stems, guide_group)

    # The HTML uses dashed, heavy borders for candidate nodes. Draw the same cue.
    border_segments: list[tuple[np.ndarray, np.ndarray]] = []
    border_colors: list[tuple[float, float, float]] = []
    border_radii: list[float] = []
    for i, node in enumerate(model.nodes):
        props = node.get("shapeProperties") or {}
        raw_dashes = props.get("borderDashes")
        if not raw_dashes and float(node.get("borderWidth", 1.0)) <= 1.5:
            continue
        center = model.points[i]
        ring_radius = model.node_radii[i] * 1.14
        ring = np.asarray(
            [
                center + np.array((ring_radius * math.cos(2 * math.pi * k / 64), ring_radius * math.sin(2 * math.pi * k / 64), 0.015))
                for k in range(64)
            ]
        )
        if isinstance(raw_dashes, list) and len(raw_dashes) >= 2:
            pattern = [max(0.02, float(raw_dashes[0]) / model.layout_scale), max(0.02, float(raw_dashes[1]) / model.layout_scale)]
        else:
            pattern = None
        parts = _polyline_segments(ring, True, pattern)
        border_segments.extend(parts)
        border_color = _hex_rgb((node.get("color") or {}).get("border"), (0.0, 0.0, 0.0))
        border_colors.extend([border_color] * len(parts))
        border_radii.extend([max(0.012, 0.5 * float(node.get("borderWidth", 2.0)) / model.layout_scale)] * len(parts))
    if border_segments:
        vertices, edge_ids = _segment_arrays(border_segments)
        borders = ps.register_curve_network("Dashed candidate node borders", vertices, edge_ids, color=(0.0, 0.0, 0.0), material="flat")
        borders.add_scalar_quantity("HTML border radius", np.asarray(border_radii), defined_on="edges", enabled=False)
        borders.set_edge_radius_quantity("HTML border radius", autoscale=False)
        borders.add_color_quantity("HTML border color", np.asarray(border_colors), defined_on="edges", enabled=True)
        _add_to_group(borders, graph_group)

    # Keep graph.html's colors, but use Polyscope's lit wax material so each
    # dot reads as a genuinely round sphere rather than a flat color disc.
    cloud = ps.register_point_cloud(
        "Graph nodes",
        model.points,
        radius=0.15,
        color=(0.75, 0.75, 0.75),
        material="wax",
        point_render_mode="sphere",
    )
    cloud.add_scalar_quantity("Degree (z)", model.degrees, enabled=False, datatype="standard")
    cloud.add_scalar_quantity("HTML x", model.html_xy[:, 0], enabled=False)
    cloud.add_scalar_quantity("HTML y", model.html_xy[:, 1], enabled=False)
    cloud.add_scalar_quantity("HTML node radius", model.node_radii, enabled=False)
    cloud.set_point_radius_quantity("HTML node radius", autoscale=False)
    cloud.add_color_quantity("HTML node color", model.node_colors, enabled=True)
    _add_to_group(cloud, graph_group)

    labels.node_anchors = [
        (point + np.array((0.0, 0.0, radius * 0.55)), str(node.get("label", node_id)))
        for point, radius, node, node_id in zip(model.points, model.node_radii, model.nodes, model.ids, strict=True)
    ]
    return labels


def _font_path() -> Path | None:
    candidates = [
        Path(r"C:\Windows\Fonts\malgun.ttf"),
        Path(r"C:\Windows\Fonts\malgunsl.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    ]
    return next((path for path in candidates if path.exists()), None)


def _project_to_screen(ps: Any, psim: Any, point: np.ndarray) -> tuple[float, float] | None:
    params = ps.get_view_camera_parameters()
    view = np.asarray(params.get_view_mat(), dtype=float)
    camera = view @ np.array((point[0], point[1], point[2], 1.0))
    if camera[2] >= -1e-6:
        return None
    tan_half = math.tan(math.radians(float(params.get_fov_vertical_deg())) * 0.5)
    aspect = float(params.get_aspect())
    x_ndc = (camera[0] / -camera[2]) / (tan_half * aspect)
    y_ndc = (camera[1] / -camera[2]) / tan_half
    width, height = psim.GetIO().DisplaySize
    x = (x_ndc + 1.0) * 0.5 * width
    y = (1.0 - y_ndc) * 0.5 * height
    if x < -300 or x > width + 300 or y < -100 or y > height + 100:
        return None
    return float(x), float(y)


def _draw_text(psim: Any, draw_list: Any, font: Any, position: tuple[float, float], text: str, color: tuple[float, float, float], size: float) -> None:
    rgb = tuple(max(0, min(255, round(channel * 255))) for channel in color)
    shadow = psim.IM_COL32(255, 255, 255, 225)
    foreground = psim.IM_COL32(rgb[0], rgb[1], rgb[2], 255)
    shadow_pos = (position[0] + 1.4, position[1] + 1.4)
    if font is not None:
        draw_list.AddText(font, size, shadow_pos, shadow, text)
        draw_list.AddText(font, size, position, foreground, text)
    else:
        draw_list.AddText(shadow_pos, shadow, text)
        draw_list.AddText(position, foreground, text)


@dataclass
class ViewerState:
    model: GraphModel
    labels: SceneLabels
    mtime_ns: int
    watch: bool
    watch_interval: float
    next_watch_at: float
    show_node_labels: bool = True
    show_hyperedge_labels: bool = True
    auto_fit_on_reload: bool = True
    last_error: str = ""


def _fit_camera(ps: Any, model: GraphModel) -> None:
    low = model.points.min(axis=0)
    high = model.points.max(axis=0)
    center = (low + high) * 0.5
    span = max(float((high - low).max()), 4.0)
    camera = np.array((center[0], center[1] - 1.25 * span, high[2] + 0.85 * span))
    target = np.array((center[0], center[1], low[2] + 0.30 * (high[2] - low[2])))
    ps.look_at(camera, target)


def _replace_scene(ps: Any, state: ViewerState) -> None:
    new_model = load_graph(state.model.html_path, state.model.layout_scale)
    ps.remove_all_structures()
    if hasattr(ps, "remove_all_groups"):
        ps.remove_all_groups()
    new_labels = register_scene(ps, new_model)
    state.model = new_model
    state.labels = new_labels
    state.mtime_ns = new_model.html_path.stat().st_mtime_ns
    state.last_error = ""
    if state.auto_fit_on_reload:
        _fit_camera(ps, new_model)
    print(summary(new_model, prefix="Reloaded"), flush=True)


def _make_callback(ps: Any, psim: Any, state: ViewerState, font_holder: dict[str, Any]):
    def callback() -> None:
        now = time.monotonic()
        if state.watch and now >= state.next_watch_at:
            state.next_watch_at = now + state.watch_interval
            try:
                changed = state.model.html_path.stat().st_mtime_ns != state.mtime_ns
                if changed:
                    _replace_scene(ps, state)
            except Exception as exc:  # Keep the last valid scene while graph.html is being written.
                state.last_error = str(exc)

        psim.TextUnformatted("graph.html live Polyscope viewer")
        psim.TextUnformatted(
            f"{len(state.model.nodes)} nodes | {len(state.model.edges)} directed edges | "
            f"{len(state.model.hyperedges)} hyperedges"
        )
        psim.TextUnformatted("Z = unique-neighbor Degree (exact)")
        _, state.show_node_labels = psim.Checkbox("Node labels", state.show_node_labels)
        _, state.show_hyperedge_labels = psim.Checkbox("Hyperedge labels", state.show_hyperedge_labels)
        _, state.auto_fit_on_reload = psim.Checkbox("Auto-fit after reload", state.auto_fit_on_reload)
        if psim.Button("Reload graph.html now"):
            try:
                _replace_scene(ps, state)
            except Exception as exc:
                state.last_error = str(exc)
        psim.SameLine()
        if psim.Button("Fit camera"):
            _fit_camera(ps, state.model)
        if state.watch:
            psim.TextUnformatted(f"Live reload: ON ({state.watch_interval:g} s)")
        if state.last_error:
            psim.TextWrapped(f"Reload pending: {state.last_error}")

        top = sorted(zip(state.model.ids, state.model.degrees, strict=True), key=lambda item: (-item[1], item[0]))[:8]
        psim.Separator()
        psim.TextUnformatted("Highest Degree / Z")
        for node_id, degree in top:
            psim.TextUnformatted(f"  {node_id}: {int(degree)}")

        draw_list = psim.GetForegroundDrawList()
        font = font_holder.get("font")
        if state.show_node_labels:
            for anchor, text in state.labels.node_anchors:
                screen = _project_to_screen(ps, psim, anchor)
                if screen is not None:
                    _draw_text(psim, draw_list, font, (screen[0] + 5.0, screen[1] - 10.0), text, (0.20, 0.20, 0.20), 15.0)
        if state.show_hyperedge_labels:
            for anchor, text, color in state.labels.hyperedge_anchors:
                screen = _project_to_screen(ps, psim, anchor)
                if screen is not None:
                    _draw_text(psim, draw_list, font, screen, text, color, 18.0)
            for anchor, text in state.labels.dependency_anchors:
                screen = _project_to_screen(ps, psim, anchor)
                if screen is not None:
                    _draw_text(psim, draw_list, font, screen, text, (0.29, 0.30, 0.75), 15.0)

    return callback


def summary(model: GraphModel, prefix: str = "Loaded") -> str:
    degree_min = int(model.degrees.min()) if len(model.degrees) else 0
    degree_max = int(model.degrees.max()) if len(model.degrees) else 0
    mismatch = f", {len(model.degree_mismatches)} stored-degree mismatch(es)" if model.degree_mismatches else ""
    return (
        f"{prefix} {model.html_path.name}: {len(model.nodes)} nodes, {len(model.edges)} directed edges, "
        f"{len(model.hyperedges)} hyperedges; z=Degree {degree_min}..{degree_max}{mismatch}"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--html",
        type=Path,
        default=Path(__file__).with_name("graph.html"),
        help="graph.html to parse (default: next to graph.py)",
    )
    parser.add_argument(
        "--layout-scale",
        type=float,
        default=DEFAULT_LAYOUT_SCALE,
        help="HTML pixels per XY world unit; relative positions remain unchanged",
    )
    parser.add_argument("--check", action="store_true", help="validate dynamic parsing and exit without opening Polyscope")
    parser.add_argument("--no-watch", action="store_true", help="disable live reload while the viewer is open")
    parser.add_argument("--watch-interval", type=float, default=1.0, help="seconds between graph.html change checks")
    parser.add_argument("--no-labels", action="store_true", help="start with node labels hidden")
    parser.add_argument("--screenshot", type=Path, help="render one screenshot and exit instead of opening the viewer")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    html_path = args.html.resolve()
    model = load_graph(html_path, args.layout_scale)
    print(summary(model))
    if model.degree_mismatches:
        for node_id, (stored, computed) in sorted(model.degree_mismatches.items()):
            print(f"  degree mismatch {node_id}: HTML={stored}, unique-neighbor={computed}")
    if args.check:
        return 0

    try:
        import polyscope as ps
        import polyscope.imgui as psim
    except ImportError as exc:
        print("Polyscope is not installed. Run: uv sync", file=sys.stderr)
        raise SystemExit(2) from exc

    font_holder: dict[str, Any] = {}

    def configure_imgui() -> None:
        psim.StyleColorsLight()
        font_path = _font_path()
        if font_path is not None:
            try:
                font = psim.GetIO().Fonts.AddFontFromFileTTF(str(font_path), 17.0)
                font_holder["font"] = font
            except Exception:
                font_holder["font"] = None

    ps.set_program_name("KIT_sodi graph.html - Degree Z")
    ps.set_use_prefs_file(False)
    ps.set_up_dir("z_up")
    ps.set_front_dir("neg_y_front")
    ps.set_navigation_style("turntable")
    ps.set_background_color((0.97, 0.97, 0.985))
    ps.set_window_size(1500, 950)
    ps.set_configure_imgui_style_callback(configure_imgui)
    ps.init()
    ps.set_ground_plane_mode("shadow_only")
    ps.set_ground_plane_height(0.0)
    ps.set_shadow_darkness(0.12)
    ps.set_transparency_mode("pretty")
    ps.set_transparency_render_passes(6)

    labels = register_scene(ps, model)
    _fit_camera(ps, model)
    state = ViewerState(
        model=model,
        labels=labels,
        mtime_ns=html_path.stat().st_mtime_ns,
        watch=not args.no_watch,
        watch_interval=max(0.2, float(args.watch_interval)),
        next_watch_at=time.monotonic() + max(0.2, float(args.watch_interval)),
        show_node_labels=not args.no_labels,
    )
    ps.set_user_callback(_make_callback(ps, psim, state, font_holder))

    if args.screenshot:
        output = args.screenshot.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        ps.screenshot(str(output), transparent_bg=False, include_UI=True)
        print(f"Wrote {output}")
        return 0

    ps.show()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
