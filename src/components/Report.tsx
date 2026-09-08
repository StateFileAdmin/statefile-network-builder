import type { Site } from "../types";
import { connectionStatusFor, deviceIsRetired } from "../data/deviceStatus";
import { StatusBadge } from "./Registers";
import "./ReportTopology.css";
const clip = (value: string, length = 28) =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;
const displayDeviceType = (device: Site["devices"][number]) =>
  device.operatingMode === "Access point only"
    ? "Wireless access point"
    : device.operatingMode === "Router + wireless access point"
      ? "Router / wireless access point"
      : device.deviceType;
function ReportTopology({ site }: { site: Site }) {
  const devices = site.devices.filter((d) => d.status !== "Removed"),
    ids = new Set(devices.map((d) => d.id)),
    connections = site.connections.filter(
      (c) => ids.has(c.source) && ids.has(c.target) && c.status !== "Removed",
    );
  if (!devices.length)
    return (
      <div className="report-topology-empty">
        No topology assets have been recorded.
      </div>
    );
  const nodeWidth = 220,
    nodeHeight = 86,
    padding = 55,
    minX = Math.min(...devices.map((d) => d.position.x)),
    minY = Math.min(...devices.map((d) => d.position.y)),
    coords = new Map(
      devices.map((d) => [
        d.id,
        { x: d.position.x - minX + padding, y: d.position.y - minY + padding },
      ]),
    ),
    width =
      Math.max(...devices.map((d) => d.position.x - minX)) +
      nodeWidth +
      padding * 2,
    height =
      Math.max(...devices.map((d) => d.position.y - minY)) +
      nodeHeight +
      padding * 2;
  return (
    <div className="report-diagram-wrap">
      <svg
        className="report-diagram"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${site.name} network topology diagram`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="report-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke" />
          </marker>
        </defs>
        <g className="report-connections">
          {connections.map((c) => {
            const source = coords.get(c.source)!,
              target = coords.get(c.target)!,
              sourceDevice = devices.find((d) => d.id === c.source),
              targetDevice = devices.find((d) => d.id === c.target),
              effectiveStatus = connectionStatusFor(
                sourceDevice,
                targetDevice,
                c.status,
              ),
              sx = source.x + nodeWidth,
              sy = source.y + nodeHeight / 2,
              tx = target.x,
              ty = target.y + nodeHeight / 2,
              mx = (sx + tx) / 2,
              my = (sy + ty) / 2,
              labelWidth = Math.min(
                180,
                Math.max(58, c.label.length * 5.7 + 14),
              );
            return (
              <g
                key={c.id}
                className={`${c.state === "Future" ? "report-connection-future" : ""} report-connection-${effectiveStatus.toLowerCase().replaceAll(" ", "-")}`}
              >
                <path
                  d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                  markerEnd="url(#report-arrow)"
                />
                <rect
                  x={mx - labelWidth / 2}
                  y={my - 10}
                  width={labelWidth}
                  height="18"
                  rx="4"
                />
                <text x={mx} y={my + 3} textAnchor="middle">
                  {clip(c.label, 28)}
                </text>
              </g>
            );
          })}
        </g>
        <g className="report-devices">
          {devices.map((d) => {
            const p = coords.get(d.id)!;
            return (
              <g
                key={d.id}
                transform={`translate(${p.x} ${p.y})`}
                className={`${d.state === "Future" ? "report-device-future" : ""} ${deviceIsRetired(d) ? "report-device-retired" : ""} ${d.status === "Needs Verification" ? "report-device-unverified" : ""} ${d.status === "Compromised" ? "report-device-compromised" : ""}`}
              >
                <rect width={nodeWidth} height={nodeHeight} rx="8" />
                <text className="device-kind" x="14" y="22">
                  {clip(displayDeviceType(d).toUpperCase(), 30)}
                </text>
                <text className="device-name" x="14" y="47">
                  {clip(d.hostname, 27)}
                </text>
                <text className="device-detail" x="14" y="68">
                  {clip(
                    d.quantity
                      ? `${d.quantity} ${d.quantity === 1 ? "camera" : "cameras"}`
                      : [d.manufacturer, d.model].filter(Boolean).join(" · ") ||
                          d.connectionType ||
                          "Details required",
                    36,
                  )}
                </text>
                <text
                  className="device-state"
                  x={nodeWidth - 12}
                  y="18"
                  textAnchor="end"
                >
                  {deviceIsRetired(d) ? "Retired" : (d.lifecycle ?? d.state)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="report-diagram-legend">
        <span>
          <i />
          Known
        </span>
        <span>
          <i className="future" />
          Planned / retired
        </span>
        <span>
          <i className="unverified" />
          Needs verification
        </span>
        <span>
          <i className="danger" />
          Compromised
        </span>
      </div>
    </div>
  );
}
export function ManagementReport({
  site,
  version,
}: {
  site: Site;
  version: number;
}) {
  const current = site.devices.filter(
    (d) => d.state === "Current" && d.status !== "Retired",
  );
  const unverified = site.devices.filter(
    (d) => d.status === "Needs Verification",
  );
  return (
    <article className="report">
      <header className="report-header">
        <div>
          <span className="report-kicker">Network Builder</span>
          <h1>Network infrastructure report</h1>
          <p>
            {site.name} · {site.address || "Address to be recorded"}
          </p>
        </div>
        <div className="report-meta">
          Generated{" "}
          {new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          <br />
          Register version {version}
        </div>
      </header>
      <section className="report-intro">
        <h2>Executive summary</h2>
        <p>{site.description}</p>
        <div className="report-metrics">
          <div>
            <b>{current.length}</b>
            <span>Current assets</span>
          </div>
          <div>
            <b>{unverified.length}</b>
            <span>Require verification</span>
          </div>
          <div>
            <b>{site.devices.filter((d) => d.state === "Future").length}</b>
            <span>Planned components</span>
          </div>
          <div>
            <b>{site.ipPlan.length}</b>
            <span>Networks / VLANs</span>
          </div>
        </div>
      </section>
      <section className="report-topology-section">
        <h2>Current, planned and retired topology</h2>
        <ReportTopology site={site} />
        <p className="report-note">
          Diagram reflects saved topology positions. Public WAN addresses and
          device management IPs are intentionally excluded.
        </p>
      </section>
      <section>
        <h2>Asset summary</h2>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Make / model</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {current.map((d) => (
              <tr key={d.id}>
                <td>{d.hostname}</td>
                <td>{displayDeviceType(d)}</td>
                <td>
                  {d.deviceType === "Client group"
                    ? "Not applicable"
                    : [d.manufacturer, d.model].filter(Boolean).join(" · ") ||
                      "Not recorded"}
                </td>
                <td>{d.physicalLocation || "Not recorded"}</td>
                <td>
                  <StatusBadge status={d.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>IP and subnet summary</h2>
        <table>
          <thead>
            <tr>
              <th>Network</th>
              <th>CIDR</th>
              <th>VLAN</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {site.ipPlan.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.cidr || "Not recorded"}</td>
                <td>{e.vlanId || "Not recorded"}</td>
                <td>{e.purpose}</td>
                <td>
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="report-columns">
        <section>
          <h2>Unverified items</h2>
          <ul>
            {unverified.length ? (
              unverified.map((d) => (
                <li key={d.id}>
                  <b>{d.hostname}:</b>{" "}
                  {d.notes || "Configuration requires verification."}
                </li>
              ))
            ) : (
              <li>No unverified devices.</li>
            )}
            {site.ipPlan
              .filter((e) => e.status === "Needs Verification")
              .map((e) => (
                <li key={e.id}>
                  <b>{e.name}:</b> addressing details require verification.
                </li>
              ))}
          </ul>
        </section>
        <section>
          <h2>Key risks and gaps</h2>
          <ul>
            {site.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      </div>
      <section>
        <h2>Planned improvements</h2>
        <ol>
          {site.plannedImprovements.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>
      <footer>
        Network Builder · Internal use only · Validate technical configuration
        before implementation.
      </footer>
    </article>
  );
}
