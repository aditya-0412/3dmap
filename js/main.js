// js/main.js

const THREE = window.__THREE__;
const OrbitControls = window.__OrbitControls__;
const HOTSPOTS = window.__HOTSPOTS__;

const CONFIG = {
  // Geometry / layout
  dotRadius: 0.04,
  dotHeight: 0.14,
  mapWidthUnits: 15,          // width of the map in world units
  sampleStep: 10,              // pixevnl step when sampling the PNG (higher = fewer dots)

  // Animation
  liftHeight: 0.35,           // max lift in world units
  influenceRadius: 1.2,       // radius around the pointer where dots are affected
  liftDamping: 0.18,          // interpolation factor towards target Y

  // Colors
  baseColor: 0x86c9d1,
  hotspotBaseColor: 0xb8b8b8,

  // Rendering
  backgroundColor: 0xf5fbfe,
  pixelRatioClamp: 2
};

const appEl = document.getElementById("app");
const tooltipEl = document.getElementById("tooltip");
const tooltipTitleEl = document.getElementById("tooltip-title");
const tooltipBodyEl = document.getElementById("tooltip-body");

let renderer, scene, camera, controls;
let instancedMesh;
let dotPositions = [];      // [{ position: THREE.Vector3, uv: {u,v}, currentY: number }]
let hotspotByInstanceId = new Map(); // instanceId -> hotspot config object
let hotspotInstanceIdById = new Map();

let pointer = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let hoverPoint = null;        // THREE.Vector3
let planeMesh;                // invisible plane used for pointer intersection

let lastHoveredHotspotId = null;
let isPointerDown = false;
let containerBounds = { left: 0, top: 0, width: 1, height: 1 };

/** Initialize everything once the image is loaded & sampled. */
function initRenderer(width, height, aspectMap) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.backgroundColor);

  camera = new THREE.PerspectiveCamera(
    35,
    appEl.clientWidth / appEl.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 6, 16);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioClamp));
  renderer.setSize(appEl.clientWidth, appEl.clientHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  appEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 30;
  controls.minPolarAngle = Math.PI / 4;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.autoRotate = false;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(4, 10, 6);
  dirLight.castShadow = false;
  scene.add(dirLight);

  // Invisible plane for pointer interaction
  const planeGeo = new THREE.PlaneGeometry(CONFIG.mapWidthUnits, CONFIG.mapWidthUnits / aspectMap);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x000000, visible: false });
  planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -Math.PI / 2;
  planeMesh.position.y = 0;
  scene.add(planeMesh);

  createDotsInstancedMesh(aspectMap);
  setupEvents();
  updateContainerBounds();
  animate();
}

/** Build InstancedMesh from dotPositions and HOTSPOTS. */
function createDotsInstancedMesh(aspectMap) {
  const count = dotPositions.length;
  const geometry = new THREE.CylinderGeometry(
    CONFIG.dotRadius,
    CONFIG.dotRadius,
    CONFIG.dotHeight,
    12,
    1
  );
  geometry.translate(0, CONFIG.dotHeight / 2, 0);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CONFIG.baseColor),
    metalness: 0.1,
    roughness: 0.4,
    flatShading: true,
    vertexColors: false
  });

  instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.castShadow = false;
  instancedMesh.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const baseColor = new THREE.Color(CONFIG.baseColor);
  const hotspotColorDefault = new THREE.Color(CONFIG.hotspotBaseColor);

  // First, map hotspots (u,v) to closest dots
  assignHotspotsToDots(aspectMap);

  for (let i = 0; i < count; i++) {
    const dot = dotPositions[i];
    dummy.position.set(dot.position.x, dot.position.y, dot.position.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    // Default color
    let color = baseColor;
    const hotspot = hotspotByInstanceId.get(i);
    if (hotspot) {
      color = new THREE.Color(hotspot.color || hotspotColorDefault);
    }
    instancedMesh.setColorAt(i, color);
  }

  instancedMesh.instanceColor.needsUpdate = true;
  scene.add(instancedMesh);
}

/** Map hotspot uv positions to nearest dot and record mapping. */
function assignHotspotsToDots() {
  hotspotByInstanceId.clear();
  hotspotInstanceIdById.clear();

  const dotsCount = dotPositions.length;

  for (const hotspot of HOTSPOTS) {
    let bestDotIndex = -1;
    let bestDistSq = Infinity;

    for (let i = 0; i < dotsCount; i++) {
      const uv = dotPositions[i].uv;
      const dx = uv.u - hotspot.u;
      const dy = uv.v - hotspot.v;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestDotIndex = i;
      }
    }

    if (bestDotIndex >= 0) {
      hotspotByInstanceId.set(bestDotIndex, hotspot);
      hotspotInstanceIdById.set(hotspot.id, bestDotIndex);
    }
  }
}

/** Sample the input PNG into dot positions. */
function sampleImageToDots(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const w = canvas.width;
  const h = canvas.height;
  const aspectMap = w / h;

  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const step = CONFIG.sampleStep;
  const mapWidthUnits = CONFIG.mapWidthUnits;
  const mapHeightUnits = mapWidthUnits / aspectMap;

  const halfW = mapWidthUnits / 2;
  const halfH = mapHeightUnits / 2;

  dotPositions = [];

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const brightness = (r + g + b) / 3;

      // Keep dots where the PNG is not transparent and not almost white.
      if (a > 40 && brightness < 245) {
        const u = x / (w - 1);
        const v = y / (h - 1);

        const worldX = (u - 0.5) * mapWidthUnits;
        const worldZ = (0.5 - v) * mapHeightUnits;

        dotPositions.push({
          position: new THREE.Vector3(worldX, 0, worldZ),
          uv: { u, v },
          currentY: 0
        });
      }
    }
  }

  return aspectMap;
}

/** Handle pointer event → update normalized pointer + hoverPoint. */
function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  containerBounds.left = rect.left;
  containerBounds.top = rect.top;
  containerBounds.width = rect.width;
  containerBounds.height = rect.height;

  const clientX = event.clientX !== undefined ? event.clientX : (event.touches?.[0]?.clientX || 0);
  const clientY = event.clientY !== undefined ? event.clientY : (event.touches?.[0]?.clientY || 0);

  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(planeMesh);
  if (hits.length > 0) {
    if (!hoverPoint) hoverPoint = new THREE.Vector3();
    hoverPoint.copy(hits[0].point);
  } else {
    hoverPoint = null;
  }
}

/** Handle click/tap on a hotspot. */
function handlePointerClick(event) {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(instancedMesh, false);
  if (hits.length > 0) {
    const hit = hits[0];
    const instanceId = hit.instanceId;
    if (instanceId == null) return;

    const hotspot = hotspotByInstanceId.get(instanceId);
    if (hotspot) {
      showTooltipForHotspot(instanceId, hotspot);
      return;
    }
  }

  hideTooltip();
}

/** Convert 3D world position to 2D screen coords. */
function worldToScreen(pos) {
  const vector = pos.clone().project(camera);
  const x = (vector.x * 0.5 + 0.5) * containerBounds.width + containerBounds.left;
  const y = (-vector.y * 0.5 + 0.5) * containerBounds.height + containerBounds.top;
  return { x, y };
}

/** Show tooltip anchored at hotspot dot. */
function showTooltipForHotspot(instanceId, hotspot) {
  lastHoveredHotspotId = hotspot.id;

  // Get world position of instance
  const dummy = new THREE.Object3D();
  instancedMesh.getMatrixAt(instanceId, dummy.matrix);
  dummy.position.setFromMatrixPosition(dummy.matrix);

  const screen = worldToScreen(dummy.position);

  tooltipTitleEl.textContent = hotspot.label || "";
  tooltipBodyEl.textContent = hotspot.description || "";
  tooltipEl.style.left = `${screen.x}px`;
  tooltipEl.style.top = `${screen.y}px`;
  tooltipEl.classList.add("visible");
}

/** Hide tooltip. */
function hideTooltip() {
  lastHoveredHotspotId = null;
  tooltipEl.classList.remove("visible");
}

/** Reposition tooltip if visible on resize or camera move. */
function updateTooltipPosition() {
  if (!lastHoveredHotspotId) return;
  const instanceId = hotspotInstanceIdById.get(lastHoveredHotspotId);
  if (instanceId == null) return;

  const dummy = new THREE.Object3D();
  instancedMesh.getMatrixAt(instanceId, dummy.matrix);
  dummy.position.setFromMatrixPosition(dummy.matrix);

  const screen = worldToScreen(dummy.position);
  tooltipEl.style.left = `${screen.x}px`;
  tooltipEl.style.top = `${screen.y}px`;
}

/** Window resize handler. */
function onResize() {
  if (!renderer || !camera) return;

  const width = appEl.clientWidth;
  const height = appEl.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  updateContainerBounds();
  updateTooltipPosition();
}

function updateContainerBounds() {
  const rect = renderer.domElement.getBoundingClientRect();
  containerBounds.left = rect.left;
  containerBounds.top = rect.top;
  containerBounds.width = rect.width;
  containerBounds.height = rect.height;
}

/** Mouse / touch events. */
function setupEvents() {
  const canvas = renderer.domElement;

  window.addEventListener("resize", onResize);

  canvas.addEventListener("pointermove", (e) => {
    updatePointer(e);
  });

  canvas.addEventListener("pointerdown", (e) => {
    isPointerDown = true;
  });

  canvas.addEventListener("pointerup", (e) => {
    isPointerDown = false;
    handlePointerClick(e);
  });

  canvas.addEventListener("pointerleave", () => {
    hoverPoint = null;
  });
}

/** Animation loop. */
function animate() {
  requestAnimationFrame(animate);

  const dummy = new THREE.Object3D();
  const count = dotPositions.length;

  if (instancedMesh) {
    for (let i = 0; i < count; i++) {
      const dot = dotPositions[i];

      let targetY = 0;
      if (hoverPoint) {
        const dx = dot.position.x - hoverPoint.x;
        const dz = dot.position.z - hoverPoint.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < CONFIG.influenceRadius) {
          const t = 1 - dist / CONFIG.influenceRadius;
          targetY = CONFIG.liftHeight * t;
        }
      }

      // Smooth interpolation toward targetY
      dot.currentY += (targetY - dot.currentY) * CONFIG.liftDamping;

      dummy.position.set(dot.position.x, dot.currentY, dot.position.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
  }

  controls.update();
  updateTooltipPosition();
  renderer.render(scene, camera);
}

/** Bootstrapping: load the PNG and start everything. */
(function bootstrap() {
  const img = new Image();
  img.src = "./assets/world-map-dots.png"; // make sure file exists with this name
  img.crossOrigin = "anonymous";

  img.onload = () => {
    const aspectMap = sampleImageToDots(img);
    initRenderer(img.width, img.height, aspectMap);
  };

  img.onerror = (err) => {
    console.error("Failed to load world map PNG:", err);
  };
})();