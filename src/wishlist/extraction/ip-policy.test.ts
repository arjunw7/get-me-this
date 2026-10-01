import { describe, expect, it } from "vitest";

import {
  ADDRESS_POLICY_RANGES,
  classifyPublicAddress,
  compareCanonicalAddresses,
} from "./ip-policy";

const deniedV4 = [
  "0.0.0.0",
  "10.0.0.1",
  "100.64.0.1",
  "127.0.0.1",
  "169.254.1.1",
  "172.16.0.1",
  "192.0.0.1",
  "192.0.2.1",
  "192.31.196.1",
  "192.52.193.1",
  "192.88.99.1",
  "192.168.1.1",
  "192.175.48.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "255.255.255.255",
];

describe("public address policy", () => {
  it.each(ADDRESS_POLICY_RANGES.ipv4Denied)(
    "denies the first and last address of IPv4 range %s",
    (cidr) => {
      const [networkText, prefixText] = cidr.split("/");
      const prefix = Number(prefixText);
      const network = networkText
        .split(".")
        .reduce(
          (value, part) => (value << BigInt(8)) | BigInt(part),
          BigInt(0),
        );
      const size = BigInt(1) << BigInt(32 - prefix);
      const format = (value: bigint) =>
        [24, 16, 8, 0]
          .map((shift) => Number((value >> BigInt(shift)) & BigInt(255)))
          .join(".");
      expect(classifyPublicAddress(format(network))).toBeNull();
      expect(
        classifyPublicAddress(format(network + size - BigInt(1))),
      ).toBeNull();
    },
  );

  it.each(deniedV4)("denies special-purpose IPv4 %s", (address) => {
    expect(classifyPublicAddress(address)).toBeNull();
  });

  it.each([
    "9.255.255.255",
    "11.0.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.30.255.255",
    "192.31.197.0",
    "198.17.255.255",
    "198.20.0.0",
    "203.0.112.255",
    "203.0.114.0",
  ])(
    "admits a public control adjacent to a denied IPv4 range: %s",
    (address) => {
      expect(classifyPublicAddress(address)?.family).toBe(4);
    },
  );

  it.each([
    "::",
    "::1",
    "::ffff:8.8.8.8",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002::1",
    "2620:4f:8000::1",
    "3fff::1",
    "4000::1",
    "fc00::1",
    "fe80::1",
    "ff00::1",
  ])("denies non-global or IANA special-purpose IPv6 %s", (address) => {
    expect(classifyPublicAddress(address)).toBeNull();
  });

  it.each([
    ["2001::", "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff"],
    ["2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff"],
    ["2002::", "2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    ["2620:4f:8000::", "2620:4f:8000:ffff:ffff:ffff:ffff:ffff"],
    ["3fff::", "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff"],
  ])(
    "denies both boundaries of an IPv6 special-purpose prefix",
    (first, last) => {
      expect(classifyPublicAddress(first)).toBeNull();
      expect(classifyPublicAddress(last)).toBeNull();
    },
  );

  it.each(["2000::1", "2001:200::1", "2003::1", "2620:4f:8001::1", "3ffe::1"])(
    "admits a representative global IPv6 control %s",
    (address) => {
      expect(classifyPublicAddress(address)?.family).toBe(6);
    },
  );

  it("sorts IPv4 before IPv6 and numeric bytes independent of answer order", () => {
    const values = ["2606:4700:4700::1111", "8.8.8.8", "1.1.1.1"]
      .map(classifyPublicAddress)
      .filter((value) => value !== null)
      .sort(compareCanonicalAddresses);
    expect(values.map((value) => value.address)).toEqual([
      "1.1.1.1",
      "8.8.8.8",
      "2606:4700:4700::1111",
    ]);
  });

  it("publishes the reviewable IANA-derived policy ranges", () => {
    expect(ADDRESS_POLICY_RANGES.ipv4Denied).toHaveLength(18);
    expect(ADDRESS_POLICY_RANGES.ipv6Admitted).toBe("2000::/3");
    expect(ADDRESS_POLICY_RANGES.ipv6Denied).toContain("2001::/23");
  });
});
