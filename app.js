import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

const canvas = document.getElementById("view");
const stage = document.querySelector(".viewport");

const backButton = document.querySelector(".sidebar__back");
const saveButton = document.querySelector(".save-button");

const faceNames = ["front", "right", "back", "left", "top", "bottom"];
let textColor = "#ffffff";
let cubeColor = "#000000";
let outlineColor = "#ffffff";

// TODO
backButton?.addEventListener("click", () => {});

// TODO
saveButton?.addEventListener("click", () => {});

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const composer = new EffectComposer(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(6.5, 5.5, 7.5);
camera.lookAt(0, 0, 0);

const rig = new THREE.Group();
const cubeGroup = new THREE.Group();
rig.add(cubeGroup);
scene.add(rig);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePass = new OutlinePass(
  new THREE.Vector2(stage.clientWidth, stage.clientHeight),
  scene,
  camera,
);

outlinePass.selectedObjects = [cubeGroup];

// 실루엣 설정
outlinePass.edgeStrength = 5;
outlinePass.edgeThickness = 2;
outlinePass.edgeGlow = 0;

outlinePass.visibleEdgeColor.set(outlineColor);
outlinePass.hiddenEdgeColor.set("#ffffff");

composer.addPass(outlinePass);
const smaaPass = new SMAAPass(
  stage.clientWidth * renderer.getPixelRatio(),
  stage.clientHeight * renderer.getPixelRatio(),
);

composer.addPass(smaaPass);

// Dynamic and beautiful studio lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x111827, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(6, 9, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x91acdf, 0.7);
fillLight.position.set(-6, 2, -5);
scene.add(fillLight);

// Interaction states
let pitch = -24;
let yaw = -33;
let dragging = false;
let yawVelocity = 0;
let pitchVelocity = 0;
let lastX = 0;
let lastY = 0;
let turning = false;

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;

  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  outlinePass.setSize(w, h);
  smaaPass.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(stage);
resize();

// 1. Textures & Materials Setup
const faceTextures = {};
const faceMaterials = {};

// Matte dark body background for cubies
const internalMaterial = new THREE.MeshBasicMaterial({
  color: cubeColor,
});

// Create 54 canvas-backed textures & materials
faceNames.forEach((face) => {
  faceTextures[face] = [];
  faceMaterials[face] = [];

  for (let i = 0; i < 9; i++) {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 512;

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    faceTextures[face].push(texture);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
    });

    faceMaterials[face].push(material);
  }
});

// High-resolution face texture (4x)
function updateFaceTexture(faceName, char) {
  const SIZE = 1536;
  const TILE = SIZE / 3;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = SIZE;
  tempCanvas.height = SIZE;

  const ctx = tempCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Background
  ctx.fillStyle = cubeColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Text
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 1000px "Unbounded", "Arial Black", sans-serif';
  ctx.fillText(char || " ", SIZE / 2, SIZE / 2);

  // Slice into 9 textures
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const pi = r * 3 + c;

      const texture = faceTextures[faceName][pi];
      const textureCanvas = texture.image;
      const textureContext = textureCanvas.getContext("2d");

      textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);

      textureContext.drawImage(
        tempCanvas,
        c * TILE,
        r * TILE,
        TILE,
        TILE,
        0,
        0,
        textureCanvas.width,
        textureCanvas.height,
      );

      texture.needsUpdate = true;
    }
  }
}

function updateAllTextures() {
  faceNames.forEach((face) => {
    const input = document.querySelector(`input[data-face="${face}"]`);

    const char = input ? input.value : " ";

    updateFaceTexture(face, char);
  });
}

// 2. Build 27 procedural cubies with RoundedBoxGeometry and no gaps
const cubies = [];
const S = 1; // 큐브 간격

// Cubie size 1.0 (no gap)
const cubieGeometry = new THREE.BoxGeometry(1, 1, 1);

function createCube() {
  for (let cx = -1; cx <= 1; cx++) {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cz = -1; cz <= 1; cz++) {
        const materials = [];

        // BoxGeometry material index order: [+X, -X, +Y, -Y, +Z, -Z]

        // mi = 0: +X (Right)
        if (cx === 1) {
          const pi = (1 - cy) * 3 + (1 - cz);
          materials.push(faceMaterials.right[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 1: -X (Left)
        if (cx === -1) {
          const pi = (1 - cy) * 3 + (cz + 1);
          materials.push(faceMaterials.left[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 2: +Y (Top)
        if (cy === 1) {
          const pi = (cz + 1) * 3 + (cx + 1);
          materials.push(faceMaterials.top[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 3: -Y (Bottom)
        if (cy === -1) {
          const pi = (1 - cz) * 3 + (cx + 1);
          materials.push(faceMaterials.bottom[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 4: +Z (Front)
        if (cz === 1) {
          const pi = (1 - cy) * 3 + (cx + 1);
          materials.push(faceMaterials.front[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 5: -Z (Back)
        if (cz === -1) {
          const pi = (1 - cy) * 3 + (1 - cx);
          materials.push(faceMaterials.back[pi]);
        } else {
          materials.push(internalMaterial);
        }

        const cubie = new THREE.Mesh(cubieGeometry, materials);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(cubieGeometry),
          new THREE.LineBasicMaterial({
            color: 0x5e5e5e, //큐브 외곽선
          }),
        );
        edges.scale.setScalar(1.003);
        cubie.add(edges);
        cubie.position.set(cx * S, cy * S, cz * S);

        cubeGroup.add(cubie);
        cubies.push(cubie);
      }
    }
  }
}

// 3. Rotation configurations
const movesConfig = {
  R: {
    axis: "x",
    layer: 1,
    cwAngle: -Math.PI / 2,
  },
  L: {
    axis: "x",
    layer: -1,
    cwAngle: Math.PI / 2,
  },
  U: {
    axis: "y",
    layer: 1,
    cwAngle: -Math.PI / 2,
  },
  D: {
    axis: "y",
    layer: -1,
    cwAngle: Math.PI / 2,
  },
  F: {
    axis: "z",
    layer: 1,
    cwAngle: -Math.PI / 2,
  },
  B: {
    axis: "z",
    layer: -1,
    cwAngle: Math.PI / 2,
  },
};

// Safely snap rotation matrix to prevent cumulative floating point errors
function snapCubieRotation(cubie) {
  cubie.updateMatrix();

  const mat = new THREE.Matrix4().makeRotationFromQuaternion(cubie.quaternion);

  const elements = mat.elements;

  const snapVector = (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);

    if (ax > ay && ax > az) {
      return new THREE.Vector3(Math.sign(x), 0, 0);
    }

    if (ay > ax && ay > az) {
      return new THREE.Vector3(0, Math.sign(y), 0);
    }

    return new THREE.Vector3(0, 0, Math.sign(z));
  };

  const vx = snapVector(elements[0], elements[1], elements[2]);

  let vy = snapVector(elements[4], elements[5], elements[6]);

  let vz = new THREE.Vector3().crossVectors(vx, vy);

  if (vz.lengthSq() < 0.5) {
    const tempZ = snapVector(elements[8], elements[9], elements[10]);

    vz.crossVectors(vx, tempZ);
  }

  vz.normalize();
  vy.crossVectors(vz, vx).normalize();

  const snapMat = new THREE.Matrix4().makeBasis(vx, vy, vz);

  cubie.quaternion.setFromRotationMatrix(snapMat);
}

function turn(moveName, direction = 1) {
  if (turning || !movesConfig[moveName]) {
    return;
  }

  turning = true;

  const move = movesConfig[moveName];
  const axis = move.axis;
  const layer = move.layer;
  const angle = move.cwAngle * direction;

  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  // Select cubies in the target layer
  const items = cubies.filter(
    (cubie) => Math.round(cubie.position[axis]) === layer,
  );

  items.forEach((cubie) => pivot.attach(cubie));

  const duration = 280;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);

    const ease = 1.4; // overshoot 조절
    const t = progress - 1;
    const eased = t * t * ((ease + 1) * t + ease) + 1;

    pivot.rotation[axis] = angle * eased;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      pivot.updateMatrixWorld(true);

      items.forEach((cubie) => {
        cubeGroup.attach(cubie);

        // Snap position to clean integer coordinates
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);

        snapCubieRotation(cubie);
      });

      pivot.removeFromParent();
      turning = false;
    }
  }

  requestAnimationFrame(frame);
}

// 4. View rotation
function rotateRig() {
  rig.rotation.set(
    THREE.MathUtils.degToRad(pitch),
    THREE.MathUtils.degToRad(yaw),
    0,
  );
}

// 5. Initializations
createCube();
updateAllTextures();
rotateRig();

// Re-paint textures once font family is completely loaded
document.fonts.ready.then(() => {
  updateAllTextures();
});

// Animation Loop
function animate() {
  if (!dragging) {
    yaw += yawVelocity;
    pitch += pitchVelocity;

    yawVelocity *= 0.92; // 큐브 드래그 회전 관성
    pitchVelocity *= 0.92;

    if (Math.abs(yawVelocity) < 0.01) yawVelocity = 0;
    if (Math.abs(pitchVelocity) < 0.01) pitchVelocity = 0;

    pitch = Math.max(-85, Math.min(85, pitch));

    rotateRig();
  }

  composer.render();
  requestAnimationFrame(animate);
}

animate();

// Event listeners
document.querySelectorAll("input[data-face]").forEach((input) => {
  input.addEventListener("input", () => {
    const face = input.dataset.face;
    const char = input.value;

    updateFaceTexture(face, char);
  });
});

stage.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;

  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!dragging) {
    return;
  }

  yawVelocity = (event.clientX - lastX) * 0.45;
  pitchVelocity = -(event.clientY - lastY) * 0.45;

  yaw += yawVelocity;
  pitch += pitchVelocity;

  pitch = Math.max(-85, Math.min(85, pitch));

  lastX = event.clientX;
  lastY = event.clientY;

  rotateRig();
});

stage.addEventListener("pointerup", () => {
  dragging = false;
});

stage.addEventListener("pointercancel", () => {
  dragging = false;
});

stage.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

stage.addEventListener("selectstart", (event) => {
  event.preventDefault();
});

document.querySelectorAll("[data-turn]").forEach((button) => {
  button.addEventListener("click", () => {
    turn(button.dataset.turn, Number(button.dataset.dir));
  });
});

document.getElementById("shuffle").addEventListener("click", () => {
  if (turning) {
    return;
  }

  // Generate sequence of random face turns
  const sequence = Array.from({ length: 15 }, () => {
    const face = ["R", "L", "U", "D", "F", "B"][Math.floor(Math.random() * 6)];

    const dir = Math.random() < 0.5 ? 1 : -1;

    return [face, dir];
  });

  let index = 0;

  const next = () => {
    if (index >= sequence.length) {
      return;
    }

    const [face, dir] = sequence[index++];

    turn(face, dir);

    setTimeout(next, 310);
  };

  next();
});

// 색상 팔레트
const PALETTES = {
  textPalette: [
    "#ffffff",
    "#000000",
    "#ff3b30",
    "#ff9e16",
    "#ffd60a",
    "#30d158",
    "#0a84ff",
    "#bf5af2",
  ],

  cubePalette: [
    "#ffffff",
    "#000000",
    "#ff3b30",
    "#ff9e16",
    "#ffd60a",
    "#30d158",
    "#0a84ff",
    "#bf5af2",
  ],

  backgroundPalette: ["#000000", "#ffffff"],
};

function createPalette(id, colors, callback) {
  const palette = document.getElementById(id);

  colors.forEach((color, index) => {
    const chip = document.createElement("button");

    chip.className = "color-chip";
    chip.style.background = color;

    if (index === 0) {
      chip.classList.add("active");
    }

    chip.addEventListener("click", () => {
      palette.querySelector(".active")?.classList.remove("active");

      chip.classList.add("active");

      callback(color);
    });

    palette.appendChild(chip);
  });
}

createPalette("textPalette", PALETTES.textPalette, (color) => {
  textColor = color;
  updateAllTextures();
});

createPalette("cubePalette", PALETTES.cubePalette, (color) => {
  cubeColor = color;
  internalMaterial.color.set(color);
  updateAllTextures();
});

createPalette("backgroundPalette", PALETTES.backgroundPalette, (color) => {
  backgroundColor = color;
  const isWhite = color.toLowerCase() === "#ffffff";
  const viewport = document.querySelector(".viewport");
  viewport.style.backgroundColor = color;
  if (isWhite) {
    viewport.style.backgroundImage = `
      linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px)
    `;
  } else {
    viewport.style.backgroundImage = `
      linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)
    `;
  }

  // 실루엣
  outlineColor = isWhite ? "#000000" : "#ffffff";
  outlinePass.visibleEdgeColor.set(outlineColor);

  // 큐브
  if (cubeColor === "#000000" || cubeColor === "#ffffff") {
    cubeColor = isWhite ? "#ffffff" : "#000000";
    internalMaterial.color.set(cubeColor);
  }

  // 글자
  if (textColor === "#ffffff" || textColor === "#000000") {
    textColor = isWhite ? "#000000" : "#ffffff";
  }

  updateAllTextures();
});
