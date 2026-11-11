import { d3d } from './d3d.mjs';
const windowsGpus = [{
  ...d3d('NVIDIA', 'NVIDIA GeForce RTX 3060', '2504'),
  cores: [8, 12, 16]
}, {
  ...d3d('NVIDIA', 'NVIDIA GeForce RTX 3070', '2484'),
  cores: [12, 16]
}, {
  ...d3d('NVIDIA', 'NVIDIA GeForce RTX 4060', '2882'),
  cores: [12, 16, 20]
}, {
  ...d3d('NVIDIA', 'NVIDIA GeForce RTX 2060', '1F08'),
  cores: [8, 12]
}, {
  ...d3d('NVIDIA', 'NVIDIA GeForce GTX 1650', '1F82'),
  cores: [4, 8]
}, {
  ...d3d('NVIDIA', 'NVIDIA GeForce GTX 1660 SUPER', '21C4'),
  cores: [6, 12]
}, {
  ...d3d('Intel', 'Intel(R) UHD Graphics 620', '5917'),
  cores: [4, 8]
}, {
  ...d3d('Intel', 'Intel(R) UHD Graphics 770', '4680'),
  cores: [12, 16, 20]
}, {
  ...d3d('Intel', 'Intel(R) Iris(R) Xe Graphics', '9A49'),
  cores: [8, 12]
}, {
  ...d3d('AMD', 'AMD Radeon RX 6600', '73FF'),
  cores: [12, 16]
}];
export { windowsGpus };
