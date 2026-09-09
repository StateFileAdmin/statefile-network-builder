import type { NetworkRegister, SiteRelationship } from "../types";
export function clearMissingGateways(
  register: NetworkRegister,
): NetworkRegister {
  if (!register.siteRelationships) return register;
  return {
    ...register,
    siteRelationships: register.siteRelationships.map((link) => {
      if (!link.tunnel) return link;
      const tunnel = { ...link.tunnel };
      for (const side of ["source", "target"] as const) {
        const site = register.sites.find((s) => s.id === link[`${side}SiteId`]);
        if (
          site &&
          !site.devices.some((d) => d.id === tunnel[`${side}GatewayId`])
        )
          tunnel[`${side}GatewayId`] = "";
      }
      return { ...link, tunnel };
    }),
  };
}
export function tunnelEndpointsValid(
  link: SiteRelationship,
  register: Pick<NetworkRegister, "sites">,
) {
  if (!link.tunnel) return true;
  return (["source", "target"] as const).every(
    (side) =>
      !link.tunnel![`${side}GatewayId`] ||
      register.sites
        .find((s) => s.id === link[`${side}SiteId`])
        ?.devices.some((d) => d.id === link.tunnel![`${side}GatewayId`]),
  );
}
