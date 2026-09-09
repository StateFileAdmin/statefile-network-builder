import type { Site, SiteRelationship, TunnelConfiguration } from "../types";
import { CustomSelect } from "./FormControls";
export const emptyTunnel = (): TunnelConfiguration => ({
  sourceGatewayId: "",
  targetGatewayId: "",
  sourceSubnets: "",
  targetSubnets: "",
  routing: "Inter-office only",
  permittedTraffic: "",
});
export function TunnelEditor({
  link,
  sites,
  onChange,
}: {
  link: SiteRelationship;
  sites: Site[];
  onChange: (r: SiteRelationship) => void;
}) {
  const tunnel = link.tunnel ?? emptyTunnel();
  const patch = (p: Partial<TunnelConfiguration>) =>
    onChange({ ...link, tunnel: { ...tunnel, ...p } });
  return (
    <fieldset className="span-2 tunnel-editor">
      <legend>VPN routing and endpoints</legend>
      <p className="form-help">
        Optional. Select gateways to show this relationship inside each office
        diagram. No passwords or private keys.
      </p>
      <div className="form-grid">
        {(["source", "target"] as const).map((side) => {
          const site = sites.find((s) => s.id === link[`${side}SiteId`]);
          const key = `${side}GatewayId` as const;
          return (
            <label key={side}>
              <span>
                {side === "source" ? "From" : "To"} gateway · {site?.name}
              </span>
              <CustomSelect
                label={`${side} VPN gateway`}
                value={tunnel[key]}
                options={[
                  { value: "", label: "Not documented" },
                  ...(site?.devices ?? [])
                    .filter((d) =>
                      /router|gateway|firewall/i.test(d.deviceType),
                    )
                    .map((d) => ({ value: d.id, label: d.hostname })),
                ]}
                onChange={(value) => patch({ [key]: value })}
              />
            </label>
          );
        })}
        <label>
          <span>From-site subnets</span>
          <textarea
            maxLength={2000}
            placeholder="192.168.10.0/24"
            value={tunnel.sourceSubnets}
            onChange={(e) => patch({ sourceSubnets: e.target.value })}
          />
        </label>
        <label>
          <span>To-site subnets</span>
          <textarea
            maxLength={2000}
            placeholder="192.168.20.0/24"
            value={tunnel.targetSubnets}
            onChange={(e) => patch({ targetSubnets: e.target.value })}
          />
        </label>
        <label className="span-2">
          <span>Traffic routing</span>
          <CustomSelect
            label="VPN traffic routing"
            value={tunnel.routing}
            options={[
              {
                value: "Inter-office only",
                label: "Inter-office traffic only",
              },
              {
                value: "Internet via source",
                label: `Internet through ${sites.find((s) => s.id === link.sourceSiteId)?.name ?? "from site"}`,
              },
              {
                value: "Internet via target",
                label: `Internet through ${sites.find((s) => s.id === link.targetSiteId)?.name ?? "to site"}`,
              },
            ]}
            onChange={(routing) =>
              patch({ routing: routing as TunnelConfiguration["routing"] })
            }
          />
        </label>
        <label className="span-2">
          <span>Permitted services / firewall policy</span>
          <textarea
            maxLength={4000}
            value={tunnel.permittedTraffic}
            onChange={(e) => patch({ permittedTraffic: e.target.value })}
          />
        </label>
      </div>
    </fieldset>
  );
}
