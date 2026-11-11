const d3d = (vendor, name, id) => ({
  vendor: `Google Inc. (${vendor})`,
  renderer: `ANGLE (${vendor}, ${name} (0x0000${id}) Direct3D11 vs_5_0 ps_5_0, D3D11)`
});
export { d3d };
