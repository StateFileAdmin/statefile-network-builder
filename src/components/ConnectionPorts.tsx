import type { NetworkConnection, NetworkDevice } from "../types";
import { usesPhysicalPort } from "../data/connectionTypes";
import { portConnections } from "../data/physicalPorts";
import { CustomSelect } from "./FormControls";
export function ConnectionPorts({
  connection,
  devices,
  connections,
  onChange,
}: {
  connection: NetworkConnection;
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  onChange: (c: NetworkConnection) => void;
}) {
  if (!usesPhysicalPort(connection)) return null;
  return (
    <>
      {(["source", "target"] as const).map((side) => {
        const device = devices.find((d) => d.id === connection[side]);
        const key = side === "source" ? "sourcePortId" : "targetPortId";
        const ports = device?.physicalPorts ?? [];
        if (!ports.length) return null;
        const choices = ports.filter(
          (p) =>
            p.id === connection[key] ||
            (p.enabled &&
              !portConnections(device!.id, p.id, connections).some(
                (c) => c.id !== connection.id && c.state === connection.state,
              )),
        );
        return (
          <label key={side} className="span-2">
            <span>
              {side === "source" ? "From" : "To"} port · {device?.hostname}
            </span>
            <CustomSelect
              label={`${side} physical port`}
              value={connection[key] ?? ""}
              options={[
                { value: "", label: "Not assigned" },
                ...choices.map((p) => ({
                  value: p.id,
                  label: `${p.label || "Unnamed port"} · ${p.role}`,
                })),
              ]}
              onChange={(id) =>
                onChange({ ...connection, [key]: id || undefined })
              }
            />
          </label>
        );
      })}
    </>
  );
}
