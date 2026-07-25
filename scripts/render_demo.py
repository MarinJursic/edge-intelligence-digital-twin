"""Render deterministic README evidence from the same backend simulation."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from edge_twin.contracts import TelemetryFrame
from edge_twin.simulator import TwinSimulator

OUT = ROOT / "docs"
OUT.mkdir(exist_ok=True)
W, H = 1400, 800
BG, PANEL, LINE = "#03070d", "#07111d", "#183047"
CYAN, BLUE, LIME, AMBER, RED = "#56e8ff", "#5794ff", "#a9ed66", "#ffbd59", "#ff677d"


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        ["/System/Library/Fonts/SFNSMono.ttf", "DejaVuSansMono.ttf"]
        if mono
        else ["/System/Library/Fonts/SFNS.ttf", "DejaVuSans.ttf"]
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise RuntimeError("No usable sans-serif font found for demo rendering")


def rounded(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int = 12,
    **kwargs: object,
) -> None:
    draw.rounded_rectangle(box, radius=radius, **kwargs)


def frame_image(frame: TelemetryFrame) -> Image.Image:
    tick = frame.tick
    failed = frame.failed_base_station is not None
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 62), fill="#050b13", outline=LINE)
    draw.text((28, 20), "NEXUS—5G", font=font(18, True), fill="#eaf4ff")
    draw.text((164, 23), "DIGITAL TWIN / METRO-01", font=font(11, True), fill="#708399")
    draw.ellipse((1020, 26, 1028, 34), fill=LIME)
    draw.text((1038, 23), "LIVE SIMULATION", font=font(11, True), fill="#91dca4")
    draw.text(
        (1208, 23), f"SEED 42  ·  T+{tick:02d}.0s", font=font(11, True), fill="#8291a8"
    )

    left = (24, 86, 1000, 770)
    rounded(draw, left, fill=PANEL, outline=LINE)
    draw.text(
        (47, 111), "CITY CORE / OPERATIONS VIEW", font=font(13, True), fill="#dceafd"
    )
    draw.text(
        (47, 136),
        "RADIO + COMPUTE  ·  DETERMINISTIC REPLAY",
        font=font(10, True),
        fill="#708399",
    )
    # top-down street grid
    ox, oy, scale = 68, 176, 13.5
    for x in range(0, 65, 8):
        draw.line(
            (ox + x * scale, oy, ox + x * scale, oy + 42 * scale),
            fill="#10263a",
            width=2,
        )
    for y in range(0, 43, 7):
        draw.line(
            (ox, oy + y * scale, ox + 65 * scale, oy + y * scale),
            fill="#10263a",
            width=2,
        )
    draw.rectangle(
        (ox, oy + 18 * scale, ox + 65 * scale, oy + 24 * scale), fill="#0b1926"
    )
    draw.rectangle(
        (ox + 29 * scale, oy, ox + 35 * scale, oy + 42 * scale), fill="#0b1926"
    )
    for bx, by, bw, bh in [
        (2, 2, 10, 7),
        (15, 3, 9, 9),
        (39, 2, 10, 8),
        (52, 3, 9, 13),
        (3, 28, 11, 10),
        (17, 30, 8, 9),
        (39, 29, 10, 10),
        (53, 28, 8, 8),
    ]:
        draw.rectangle(
            (
                ox + bx * scale,
                oy + by * scale,
                ox + (bx + bw) * scale,
                oy + (by + bh) * scale,
            ),
            fill="#102234",
            outline="#1e4057",
            width=2,
        )
        for wx in range(bx + 2, bx + bw - 1, 3):
            draw.rectangle(
                (
                    ox + wx * scale,
                    oy + (by + 2) * scale,
                    ox + wx * scale + 12,
                    oy + (by + 2) * scale + 4,
                ),
                fill="#2d7086",
            )
    stations = [(22, 20, "gNB-WEST"), (39, 19, "gNB-CENTRAL"), (32, 8, "gNB-NORTH")]
    for sx, sy, name in stations:
        outage = failed and name == "gNB-CENTRAL"
        color = RED if outage else CYAN
        px, py = ox + sx * scale, oy + sy * scale
        draw.ellipse((px - 60, py - 60, px + 60, py + 60), outline=color, width=2)
        draw.ellipse(
            (px - 12, py - 12, px + 12, py + 12), fill="#07111d", outline=color, width=3
        )
        draw.line((px, py - 18, px, py + 18), fill=color, width=3)
        draw.text((px + 17, py - 8), name, font=font(9, True), fill=color)
    # devices from actual frame
    for device in frame.devices:
        x = ox + (device.position.x_m + 32) * scale
        z = oy + 21 * scale + device.position.z_m * scale
        color = LIME if device.kind == "drone" else AMBER
        r = 6 if device.device_id == "AV-07" else 4
        draw.ellipse((x - r, z - r, x + r, z + r), fill=color)
    # current task path
    source = (ox + 48 * scale, oy + 19.2 * scale)
    target = (ox + (22 if failed else 39) * scale, oy + 20 * scale)
    draw.line((*source, *target), fill=CYAN, width=4)
    progress = (tick % 10) / 10
    px = source[0] + (target[0] - source[0]) * progress
    py = source[1] + (target[1] - source[1]) * progress
    draw.ellipse(
        (px - 8, py - 8, px + 8, py + 8), fill="#ffffff", outline=CYAN, width=3
    )
    if failed:
        rounded(draw, (282, 100, 784, 151), 9, fill="#281b10", outline="#8e6430")
        draw.text(
            (303, 117),
            "gNB-CENTRAL LOST  ·  ADAPTIVE REROUTE ACTIVE",
            font=font(11, True),
            fill="#ffd391",
        )

    # inspector
    rounded(draw, (1024, 86, 1376, 770), fill=PANEL, outline=LINE)
    draw.text((1048, 111), "ACTIVE DECISION", font=font(11, True), fill="#8291a8")
    rounded(draw, (1048, 142, 1352, 252), 10, fill="#0a1a28", outline="#1a5264")
    draw.text(
        (1070, 163),
        frame.decision.target.upper().replace("_", " "),
        font=font(20, True),
        fill=CYAN,
    )
    draw.text((1070, 195), frame.decision.node_id, font=font(11, True), fill="#dceafd")
    rationale = (
        "Reroute preserves availability" if failed else "Lowest feasible objective"
    )
    draw.text((1070, 221), rationale, font=font(10), fill="#8291a8")
    labels = [
        (
            "LATENCY",
            f"{frame.metrics.latency_ms:.1f} ms",
            CYAN if frame.metrics.latency_ms < 25 else AMBER,
        ),
        ("THROUGHPUT", f"{frame.metrics.throughput_mbps:.0f} Mbps", BLUE),
        ("QUEUE", f"{frame.metrics.queue_depth} tasks", AMBER if failed else LIME),
        ("ENERGY", f"{frame.metrics.energy_j:.1f} J/task", LIME),
        ("ACCURACY", f"{frame.metrics.accuracy_pct:.1f} %", CYAN),
        (
            "SLA",
            f"{frame.metrics.sla_pct:.1f} %",
            LIME if frame.metrics.sla_pct > 95 else AMBER,
        ),
    ]
    for index, (label, value, color) in enumerate(labels):
        col, row = index % 2, index // 2
        x, y = 1048 + col * 153, 278 + row * 112
        rounded(draw, (x, y, x + 143, y + 96), 8, fill="#08131f", outline=LINE)
        draw.text((x + 12, y + 13), label, font=font(9, True), fill="#708399")
        draw.text((x + 12, y + 45), value, font=font(15, True), fill=color)
    draw.text((1048, 638), "EVENT STREAM", font=font(10, True), fill="#8291a8")
    event = frame.events[0]
    draw.ellipse((1048, 681, 1055, 688), fill=RED if failed else CYAN)
    draw.text((1067, 670), event.label, font=font(10, True), fill="#dceafd")
    draw.text((1067, 691), event.detail, font=font(10), fill="#8291a8")
    draw.text(
        (1048, 732),
        f"CONTRACT 1.0  ·  {frame.source.name}",
        font=font(9, True),
        fill="#567086",
    )
    return image


def comparison_image(healthy: Image.Image, outage: Image.Image) -> Image.Image:
    """Build a GitHub-readable before/after plate from real scenario frames."""
    canvas = Image.new("RGB", (W, 1934), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text(
        (28, 24),
        "FAILURE RECOVERY — BEFORE / AFTER",
        font=font(24, True),
        fill="#eaf4ff",
    )
    draw.text(
        (28, 62),
        "The same deterministic workload, topology, and telemetry contract in two network states.",
        font=font(14),
        fill="#91a6bb",
    )
    rounded(draw, (24, 106, W - 24, 166), 10, fill="#07111d", outline=LINE)
    draw.ellipse((48, 128, 62, 142), fill=LIME)
    draw.text(
        (78, 121),
        "1  HEALTHY — AV-07 offloads to MEC-CENTRAL; every gNodeB is available.",
        font=font(15, True),
        fill="#dceafd",
    )
    canvas.paste(healthy, (0, 184))
    rounded(draw, (24, 1008, W - 24, 1068), 10, fill="#281b10", outline="#8e6430")
    draw.ellipse((48, 1030, 62, 1044), fill=RED)
    draw.text(
        (78, 1023),
        "2  OUTAGE — gNB-CENTRAL fails; five UEs hand over and AV-07 reroutes to MEC-WEST.",
        font=font(15, True),
        fill="#ffd391",
    )
    canvas.paste(outage, (0, 1086))
    draw.text(
        (28, 1900),
        "3  VERIFY — compare execution node, latency, queue depth, SLA, topology state, and event stream.",
        font=font(14, True),
        fill=CYAN,
    )
    return canvas


def main() -> None:
    simulator = TwinSimulator()
    telemetry = (
        [simulator.step() for _ in range(4)]
        + [simulator.step("gnb-central") for _ in range(8)]
        + [simulator.step() for _ in range(4)]
    )
    frames = [frame_image(frame) for frame in telemetry]
    frames[0].save(OUT / "nexus-5g-overview.png", optimize=True)
    comparison_image(frames[0], frames[5]).save(
        OUT / "nexus-5g-showcase.png", optimize=True
    )
    frames[0].save(
        OUT / "nexus-5g-failure-recovery.gif",
        save_all=True,
        append_images=frames[1:],
        duration=1000,
        loop=0,
        optimize=True,
    )
    with tempfile.TemporaryDirectory(prefix="nexus-5g-video-") as temp_dir:
        temp_path = Path(temp_dir)
        for index, image in enumerate(frames):
            image.save(temp_path / f"frame-{index:03d}.png", optimize=True)
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-framerate",
                "1",
                "-i",
                str(temp_path / "frame-%03d.png"),
                "-vf",
                "fps=30,format=yuv420p",
                "-movflags",
                "+faststart",
                str(OUT / "nexus-5g-failure-recovery.mp4"),
            ],
            check=True,
        )
    print(f"Rendered {OUT / 'nexus-5g-overview.png'}")
    print(f"Rendered {OUT / 'nexus-5g-showcase.png'}")
    print(f"Rendered {OUT / 'nexus-5g-failure-recovery.gif'}")
    print(f"Rendered {OUT / 'nexus-5g-failure-recovery.mp4'}")


if __name__ == "__main__":
    main()
