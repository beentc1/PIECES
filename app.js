import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const canvas = document.getElementById("view");
const stage = document.querySelector(".viewport");

const backButton = document.querySelector(".sidebar__back");
const autoRotateToggle = document.getElementById("autoRotate");

const faceNames = ["front", "right", "back", "left", "top", "bottom"];
let textColor = "#ffffff";
let cubeColor = "#000000";
let outlineColor = "#ffffff";

// ==============================================================
// 메인 화면으로 돌아가는 동작을 연결할 자리
backButton?.addEventListener("click", () => {});

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});

renderer.setPixelRatio(window.devicePixelRatio);
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

const outputPass = new OutputPass();
composer.addPass(outputPass);
composer.addPass(smaaPass);

// ==============================================================
// 큐브 형태와 텍스처가 모든 방향에서 읽히도록 하는 기본 조명
// ==============================================================
scene.add(new THREE.HemisphereLight(0xffffff, 0x111827, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(6, 9, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x91acdf, 0.7);
fillLight.position.set(-6, 2, -5);
scene.add(fillLight);

// ==============================================================
// 오브젝트 회전과 드래그 조작 상태
// ==============================================================
let pitch = -24;
let yaw = -33;
let targetPitch = pitch;
let targetYaw = yaw;
let dragging = false;
let lastX = 0;
let lastY = 0;
let turning = false;
let cameraDistance = 11.25;

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

// ==============================================================
// 우측 면 미리보기: 실제 피스의 위치·회전·재질 타일을 3×3 평면으로 재조합한다.
// ==============================================================
const previewCanvases = Object.fromEntries(
  faceNames.map((face) => [
    face,
    document.querySelector(`[data-preview="${face}"]`),
  ]),
);
const previewConfig = {
  front: {
    axis: "z",
    layer: 1,
    normal: [0, 0, 1],
    col: [1, 0, 0],
    up: [0, 1, 0],
  },
  right: {
    axis: "x",
    layer: 1,
    normal: [1, 0, 0],
    col: [0, 0, -1],
    up: [0, 1, 0],
  },
  back: {
    axis: "z",
    layer: -1,
    normal: [0, 0, -1],
    col: [-1, 0, 0],
    up: [0, 1, 0],
  },
  left: {
    axis: "x",
    layer: -1,
    normal: [-1, 0, 0],
    col: [0, 0, 1],
    up: [0, 1, 0],
  },
  top: {
    axis: "y",
    layer: 1,
    normal: [0, 1, 0],
    col: [1, 0, 0],
    up: [0, 0, -1],
  },
  bottom: {
    axis: "y",
    layer: -1,
    normal: [0, -1, 0],
    col: [1, 0, 0],
    up: [0, 0, 1],
  },
};
const localFaceNormals = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const localTextureAxes = [
  { u: [0, 0, -1], up: [0, 1, 0] },
  { u: [0, 0, 1], up: [0, 1, 0] },
  { u: [1, 0, 0], up: [0, 0, -1] },
  { u: [1, 0, 0], up: [0, 0, 1] },
  { u: [1, 0, 0], up: [0, 1, 0] },
  { u: [-1, 0, 0], up: [0, 1, 0] },
];

const PREVIEW_SIZE = 168;
function oldUpdateFacePreviews() {
  const scratch = document.createElement("canvas");
  scratch.width = scratch.height = PREVIEW_SIZE;
  const scratchContext = scratch.getContext("2d");
  const image = new ImageData(PREVIEW_SIZE, PREVIEW_SIZE);
  const savedRigRotation = rig.rotation.clone();
  const savedTarget = renderer.getRenderTarget();
  const savedClearColor = renderer.getClearColor(new THREE.Color());
  const savedClearAlpha = renderer.getClearAlpha();
  const savedViewport = renderer.getViewport(new THREE.Vector4());
  const savedScissor = renderer.getScissor(new THREE.Vector4());
  const savedScissorTest = renderer.getScissorTest();

  // ==============================================================
  // 오브젝트 뷰의 회전은 잠시 제거하고, 각 면을 월드 축 정면에서 촬영한다.
  // ==============================================================
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld(true);
  renderer.setClearColor(cubeColor, 1);

  Object.entries(previewConfig).forEach(([face, config]) => {
    previewCamera.position.fromArray(config.position);
    previewCamera.up.fromArray(config.up);
    previewCamera.lookAt(0, 0, 0);
    previewCamera.updateProjectionMatrix();
    previewCamera.updateMatrixWorld(true);
    renderer.setRenderTarget(previewTarget);
    renderer.setViewport(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, previewCamera);
    renderer.readRenderTargetPixels(
      previewTarget,
      0,
      0,
      PREVIEW_SIZE,
      PREVIEW_SIZE,
      previewPixels,
    );
    image.data.set(previewPixels);
    scratchContext.putImageData(image, 0, 0);
    const context = previewCanvases[face].getContext("2d");
    context.save();
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.scale(1, -1);
    context.drawImage(scratch, 0, -PREVIEW_SIZE);
    context.restore();
  });

  renderer.setRenderTarget(savedTarget);
  renderer.setViewport(savedViewport);
  renderer.setScissor(savedScissor);
  renderer.setScissorTest(savedScissorTest);
  renderer.setClearColor(savedClearColor, savedClearAlpha);
  rig.rotation.copy(savedRigRotation);
  rig.updateMatrixWorld(true);
}

function updateFacePreviews() {
  Object.entries(previewConfig).forEach(([face, config]) => {
    const canvas = previewCanvases[face];
    const context = canvas.getContext("2d");
    const size = canvas.width;
    const tile = size / 3;
    const normal = new THREE.Vector3().fromArray(config.normal);
    const colAxis = new THREE.Vector3().fromArray(config.col);
    const upAxis = new THREE.Vector3().fromArray(config.up);

    context.fillStyle = cubeColor;
    context.fillRect(0, 0, size, size);

    cubies
      .filter(
        (cubie) => Math.round(cubie.position[config.axis]) === config.layer,
      )
      .forEach((cubie) => {
        const faceIndex = localFaceNormals.findIndex(
          (localNormal) =>
            localNormal.clone().applyQuaternion(cubie.quaternion).dot(normal) >
            0.999,
        );
        const material = cubie.material[faceIndex];
        if (faceIndex < 0 || !material?.map?.image) return;

        const col = Math.round(cubie.position.dot(colAxis)) + 1;
        const row = 1 - Math.round(cubie.position.dot(upAxis));
        if (row < 0 || row > 2 || col < 0 || col > 2) return;

        const axes = localTextureAxes[faceIndex];
        const worldU = new THREE.Vector3()
          .fromArray(axes.u)
          .applyQuaternion(cubie.quaternion);
        const worldUp = new THREE.Vector3()
          .fromArray(axes.up)
          .applyQuaternion(cubie.quaternion);
        const ux = Math.round(worldU.dot(colAxis));
        const uy = Math.round(-worldU.dot(upAxis));
        // 캔버스의 y축은 아래 방향이므로 텍스처의 위쪽 축은 부호를 반전한다.
        const vx = Math.round(-worldUp.dot(colAxis));
        const vy = Math.round(worldUp.dot(upAxis));

        context.save();
        context.beginPath();
        context.rect(col * tile, row * tile, tile, tile);
        context.clip();
        context.translate((col + 0.5) * tile, (row + 0.5) * tile);
        context.transform(ux, uy, vx, vy, 0, 0);
        context.drawImage(material.map.image, -tile / 2, -tile / 2, tile, tile);
        context.restore();
      });
  });
}

// ==============================================================
// 1. 면별 글자 텍스처와 큐브 컬러 재질 설정
// ==============================================================
const faceTextures = {};
const faceMaterials = {};

// ==============================================================
// 각 피스의 텍스처가 없는 안쪽 면에 적용할 기본 큐브 재질
// ==============================================================
const internalMaterial = new THREE.MeshBasicMaterial({
  color: cubeColor,
});

// ==============================================================
// 6개 면 × 3×3 조각에 사용할 캔버스 텍스처와 재질 생성
// ==============================================================
const materialMeta = new WeakMap();

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
    materialMeta.set(material, { face, tileIndex: i });

    faceMaterials[face].push(material);
  }
});

// ==============================================================
// 한 면의 글자를 고해상도로 그린 뒤 3×3 텍스처 조각으로 분할
// ==============================================================
function updateFaceTexture(faceName, char) {
  const SIZE = 1536;
  const TILE = SIZE / 3;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = SIZE;
  tempCanvas.height = SIZE;

  const ctx = tempCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ==============================================================
  // 피스 표면에 보일 큐브 컬러 배경
  // ==============================================================
  ctx.fillStyle = cubeColor;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // ==============================================================
  // 입력된 한 글자
  // ==============================================================
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 1000px "Unbounded", "Arial Black", sans-serif';
  ctx.fillText(char || " ", SIZE / 2, SIZE / 2);

  // ==============================================================
  // 완성된 글자를 9개 피스에 맞춰 정확히 분할
  // ==============================================================
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

// ==============================================================
// 2. 27개 피스를 생성하고, 바깥 면에만 해당 글자 조각을 배치
// ==============================================================
const cubies = [];
const S = 1; // 큐브 간격

// ==============================================================
// 피스 크기: 1.0 기준으로 맞물리는 3×3×3 구조
// ==============================================================
const cubieGeometry = new THREE.BoxGeometry(1, 1, 1);

function createCube() {
  for (let cx = -1; cx <= 1; cx++) {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cz = -1; cz <= 1; cz++) {
        const materials = [];

        // ==============================================================
        // BoxGeometry 재질 인덱스 순서: [+X, -X, +Y, -Y, +Z, -Z]
        // ==============================================================

        // mi = 0: 오른쪽 면(+X)
        if (cx === 1) {
          const pi = (1 - cy) * 3 + (1 - cz);
          materials.push(faceMaterials.right[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 1: 왼쪽 면(-X)
        if (cx === -1) {
          const pi = (1 - cy) * 3 + (cz + 1);
          materials.push(faceMaterials.left[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 2: 윗면(+Y)
        if (cy === 1) {
          const pi = (cz + 1) * 3 + (cx + 1);
          materials.push(faceMaterials.top[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 3: 아랫면(-Y)
        if (cy === -1) {
          const pi = (1 - cz) * 3 + (cx + 1);
          materials.push(faceMaterials.bottom[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 4: 앞면(+Z)
        if (cz === 1) {
          const pi = (1 - cy) * 3 + (cx + 1);
          materials.push(faceMaterials.front[pi]);
        } else {
          materials.push(internalMaterial);
        }

        // mi = 5: 뒷면(-Z)
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
        edges.scale.setScalar(1.002);
        cubie.add(edges);
        cubie.position.set(cx * S, cy * S, cz * S);

        cubeGroup.add(cubie);
        cubies.push(cubie);
      }
    }
  }
}

// ==============================================================
// 3. TURN 버튼별 회전 축, 대상 레이어, 시계 방향 각도 설정
// ==============================================================
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

// ==============================================================
// 반복 회전 뒤에도 피스 방향이 흐트러지지 않도록 90도 단위로 보정
// ==============================================================
function snapCubieRotation(cubie) {
  // 피스의 로컬 축을 가장 가까운 정수 축(-1, 0, 1)으로 고정한다.
  // 이 보정값은 우측 면 미리보기에서 외부 재질을 판별하는 기준이기도 하다.
  const snapAxis = (axis) => {
    const vector = axis.applyQuaternion(cubie.quaternion);
    const values = [vector.x, vector.y, vector.z];
    const dominant = values.reduce(
      (best, value, index) =>
        Math.abs(value) > Math.abs(values[best]) ? index : best,
      0,
    );
    return new THREE.Vector3(
      dominant === 0 ? Math.sign(values[0]) : 0,
      dominant === 1 ? Math.sign(values[1]) : 0,
      dominant === 2 ? Math.sign(values[2]) : 0,
    );
  };

  const xAxis = snapAxis(new THREE.Vector3(1, 0, 0));
  const yAxis = snapAxis(new THREE.Vector3(0, 1, 0));
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const correctedYAxis = new THREE.Vector3()
    .crossVectors(zAxis, xAxis)
    .normalize();
  cubie.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, correctedYAxis, zAxis),
  );
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

  // 이번 TURN에서 회전할 9개 피스 선택
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

        // 회전 후 좌표를 정수 격자 위치로 보정
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);

        snapCubieRotation(cubie);
      });

      pivot.removeFromParent();
      turning = false;
      // 각 TURN이 끝난 시점의 6개 면을 우측 평면 미리보기에 반영
      updateFacePreviews();
    }
  }

  requestAnimationFrame(frame);
}

// ==============================================================
// 4. 드래그·키보드·자동 회전에 쓰이는 카메라 시점 회전
// ==============================================================
function rotateRig() {
  rig.rotation.set(
    THREE.MathUtils.degToRad(pitch),
    THREE.MathUtils.degToRad(yaw),
    0,
  );
}

// ==============================================================
// 5. 큐브 생성과 최초 텍스처 적용
// ==============================================================
createCube();
updateAllTextures();
rotateRig();

// ==============================================================
// 웹폰트 로드 완료 후 글자 폭을 반영해 텍스처와 면 미리보기 갱신
// ==============================================================
document.fonts.ready.then(() => {
  updateAllTextures();
  updateFacePreviews();
});

// ==============================================================
// 매 프레임: 자동 회전과 드래그 목표 각도를 부드럽게 보간해 렌더링
// ==============================================================
function animate() {
  if (!dragging && autoRotateToggle.checked) targetYaw += 0.18;
  yaw = THREE.MathUtils.damp(yaw, targetYaw, 12, 1 / 60);
  pitch = THREE.MathUtils.damp(pitch, targetPitch, 12, 1 / 60);
  rotateRig();

  composer.render();
  requestAnimationFrame(animate);
}

animate();

// ==============================================================
// 입력 글자 변경 시 해당 면의 3×3 텍스처와 우측 평면 미리보기를 갱신
// ==============================================================
const unifiedWord = document.getElementById("unifiedWord");
const faceInputs = Array.from(document.querySelectorAll("input[data-face]"));

const faceAngles = {
  front: { yaw: 0, pitch: 0 },
  right: { yaw: -90, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  left: { yaw: 90, pitch: 0 },
  top: { yaw: 0, pitch: 78 },
  bottom: { yaw: 0, pitch: -78 },
};
let activePreviewCanvas = null;

document
  .querySelectorAll("input[type='text'], input[data-face]")
  .forEach((input) => {
    input.addEventListener("pointerdown", () => {
      requestAnimationFrame(() => input.select());
    });
  });

unifiedWord?.addEventListener("input", (e) => {
  const chars = e.target.value.padEnd(6, " ").split("");
  faceInputs.forEach((input, i) => {
    input.value = chars[i] !== " " ? chars[i] : "";
    updateFaceTexture(input.dataset.face, chars[i]);
  });
  updateFacePreviews();
});

faceInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const face = input.dataset.face;
    const char = input.value;

    updateFaceTexture(face, char);
    updateFacePreviews();

    if (unifiedWord) {
      unifiedWord.value = faceInputs
        .map((i) => i.value || " ")
        .join("")
        .trimEnd();
    }
  });
});

document.querySelectorAll("[data-preview]").forEach((canvas) => {
  canvas.addEventListener("click", () => {
    if (activePreviewCanvas) {
      activePreviewCanvas.classList.remove("active");
    }

    canvas.classList.add("active");
    activePreviewCanvas = canvas;
    autoRotateToggle.checked = false;

    const face = canvas.dataset.preview;
    const angles = faceAngles[face];

    const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

    const currentYaw = normalizeAngle(targetYaw);
    const target = normalizeAngle(angles.yaw);

    let diff = target - currentYaw;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    targetYaw += diff;
    targetPitch = angles.pitch;
  });
});

stage.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  stage.classList.add("is-dragging");

  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!dragging) {
    return;
  }

  targetYaw += (event.clientX - lastX) * 0.24;
  targetPitch -= (event.clientY - lastY) * 0.24;
  targetPitch = Math.max(-78, Math.min(78, targetPitch));

  lastX = event.clientX;
  lastY = event.clientY;

  rotateRig();
});

stage.addEventListener("pointerup", () => {
  dragging = false;
  stage.classList.remove("is-dragging");
});

stage.addEventListener("pointercancel", () => {
  dragging = false;
  stage.classList.remove("is-dragging");
});

// ==============================================================
// 마우스 휠로 카메라 거리만 조절: 원근 카메라의 시야각은 변경하지 않음
// ==============================================================
stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(
      cameraDistance + event.deltaY * 0.008,
      5.5,
      17,
    );
    camera.position.setLength(cameraDistance);
  },
  { passive: false },
);

// ==============================================================
// 방향키로도 시점을 회전할 수 있어 마우스 조작 없이 접근 가능
// ==============================================================
window.addEventListener("keydown", (event) => {
  const focusedInput = document.activeElement?.matches("input");
  if (focusedInput) return;
  const step = event.shiftKey ? 12 : 6;
  if (event.key === "ArrowLeft") targetYaw -= step;
  else if (event.key === "ArrowRight") targetYaw += step;
  else if (event.key === "ArrowUp")
    targetPitch = Math.min(78, targetPitch + step);
  else if (event.key === "ArrowDown")
    targetPitch = Math.max(-78, targetPitch - step);
  else return;
  event.preventDefault();
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

  // ==============================================================
  // 무작위 TURN 시퀀스: 각 회전 완료 시 우측 면 미리보기도 즉시 갱신된다.
  // ==============================================================
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

// ==============================================================
// 텍스트·큐브·배경 컬러 팔레트 정의
// ==============================================================
const PALETTES = {
  textPalette: [
    "#ffffff",
    "#000000",
    "#ff3b30",
    "#ff9e16",
    "#ffd60a",
    "#30d158",
    "#BBFF00",
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
  updateFacePreviews();
});

createPalette("cubePalette", PALETTES.cubePalette, (color) => {
  cubeColor = color;
  internalMaterial.color.set(color);
  updateAllTextures();
  updateFacePreviews();
});

createPalette("backgroundPalette", PALETTES.backgroundPalette, (color) => {
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
  // 배경색은 면 텍스처에 직접 포함되지 않지만, 현재 상태를 다시 그려 일관성을 유지한다.
  updateFacePreviews();
});

// ==============================================================
// 9. Export 시스템
// ==============================================================

const exportTargetRadios = document.querySelectorAll(
  'input[name="exportTarget"]',
);
const exportResolution = document.getElementById("exportResolution");
const exportFaces = document.getElementById("exportFaces");
const svgFormatRadio = document.getElementById("svgFormatRadio");
const exportBtn = document.getElementById("exportBtn");

// UI 상태 업데이트
function updateExportUI() {
  const target = document.querySelector('input[name="exportTarget"]:checked');
  if (!target) return;
  const isObject = target.value === "object";

  if (isObject) {
    exportResolution.hidden = false;
    exportFaces.hidden = true;
    svgFormatRadio.disabled = true;
    const format = document.querySelector('input[name="exportFormat"]:checked');
    if (format && format.value === "svg") {
      document.querySelector(
        'input[name="exportFormat"][value="png"]',
      ).checked = true;
    }
  } else {
    exportFaces.hidden = false;
    svgFormatRadio.disabled = false;
  }

  const format = document.querySelector('input[name="exportFormat"]:checked');
  const isSvg = format && format.value === "svg";

  // Object, Face 모두 PNG면 해상도 노출 (단, Face SVG인 경우는 해상도 숨김)
  exportResolution.hidden = isSvg;
}

exportTargetRadios.forEach((radio) =>
  radio.addEventListener("change", updateExportUI),
);
document
  .querySelectorAll('input[name="exportFormat"]')
  .forEach((radio) => radio.addEventListener("change", updateExportUI));
updateExportUI();

// 유틸리티: 파일명 생성
function getExportPrefix() {
  return (
    faceNames
      .map(
        (f) =>
          (
            document.querySelector(`input[data-face="${f}"]`)?.value || " "
          ).trim() || "",
      )
      .join("")
      .toLowerCase() || "cube"
  );
}

function downloadDataURL(dataURL, filename) {
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  URL.revokeObjectURL(url);
}

// Object PNG 내보내기
function exportObjectPNG(size, isTransparent) {
  const savedW = stage.clientWidth;
  const savedH = stage.clientHeight;
  const savedAspect = camera.aspect;
  const savedClearColor = renderer.getClearColor(new THREE.Color());
  const savedClearAlpha = renderer.getClearAlpha();
  const savedOutlineEnabled = outlinePass.enabled;

  try {
    if (isTransparent) {
      outlinePass.enabled = false;
      renderer.setClearColor(0x000000, 0);
    } else {
      const bgInput = document.querySelector('input[name="exportBg"]:checked');
      const bgColor =
        bgInput && bgInput.value === "current"
          ? getComputedStyle(stage).backgroundColor
          : isTransparent
            ? "transparent"
            : "#000";
      renderer.setClearColor(bgColor, 1);
    }

    // 리사이즈
    renderer.setSize(size, size, false);
    composer.setSize(size, size);
    outlinePass.setSize(size, size);
    smaaPass.setSize(
      size * renderer.getPixelRatio(),
      size * renderer.getPixelRatio(),
    );
    camera.aspect = 1;
    camera.updateProjectionMatrix();

    renderer.setRenderTarget(null);
    composer.render();

    const dataURL = canvas.toDataURL("image/png");
    downloadDataURL(dataURL, `${getExportPrefix()}-object.png`);
  } finally {
    // 복원
    renderer.setSize(savedW, savedH, false);
    composer.setSize(savedW, savedH);
    outlinePass.setSize(savedW, savedH);
    smaaPass.setSize(
      savedW * renderer.getPixelRatio(),
      savedH * renderer.getPixelRatio(),
    );

    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();

    renderer.setClearColor(savedClearColor, savedClearAlpha);
    outlinePass.enabled = savedOutlineEnabled;

    composer.render();
  }
}

// Face PNG 내보내기
function exportFacePNG(face, isTransparent) {
  const sizeInput = document.getElementById("exportSize");
  const size = sizeInput ? parseInt(sizeInput.value, 10) : 3060;
  const tile = size / 3;

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = size;
  faceCanvas.height = size;
  const context = faceCanvas.getContext("2d");

  const config = previewConfig[face];
  const normal = new THREE.Vector3().fromArray(config.normal);
  const colAxis = new THREE.Vector3().fromArray(config.col);
  const upAxis = new THREE.Vector3().fromArray(config.up);

  if (!isTransparent) {
    context.fillStyle = cubeColor;
    context.fillRect(0, 0, size, size);
  } else {
    context.clearRect(0, 0, size, size);
  }

  cubies
    .filter((cubie) => Math.round(cubie.position[config.axis]) === config.layer)
    .forEach((cubie) => {
      const faceIndex = localFaceNormals.findIndex(
        (localNormal) =>
          localNormal.clone().applyQuaternion(cubie.quaternion).dot(normal) >
          0.999,
      );
      const material = cubie.material[faceIndex];
      if (faceIndex < 0 || !material?.map?.image) return;

      const col = Math.round(cubie.position.dot(colAxis)) + 1;
      const row = 1 - Math.round(cubie.position.dot(upAxis));
      if (row < 0 || row > 2 || col < 0 || col > 2) return;

      const axes = localTextureAxes[faceIndex];
      const worldU = new THREE.Vector3()
        .fromArray(axes.u)
        .applyQuaternion(cubie.quaternion);
      const worldUp = new THREE.Vector3()
        .fromArray(axes.up)
        .applyQuaternion(cubie.quaternion);
      const ux = Math.round(worldU.dot(colAxis));
      const uy = Math.round(-worldU.dot(upAxis));
      const vx = Math.round(-worldUp.dot(colAxis));
      const vy = Math.round(worldUp.dot(upAxis));

      context.save();
      if (!isTransparent) {
        context.fillStyle = cubeColor;
        context.fillRect(col * tile, row * tile, tile, tile);
      }
      context.beginPath();
      context.rect(col * tile, row * tile, tile, tile);
      context.clip();
      context.translate((col + 0.5) * tile, (row + 0.5) * tile);
      context.transform(ux, uy, vx, vy, 0, 0);
      context.drawImage(material.map.image, -tile / 2, -tile / 2, tile, tile);
      context.restore();
    });

  downloadDataURL(
    faceCanvas.toDataURL("image/png"),
    `${getExportPrefix()}-${face}.png`,
  );
}

// Face SVG 내보내기
function exportFaceSVG(face, isTransparent) {
  const size = 1536;
  const tile = size / 3;
  const config = previewConfig[face];
  const normal = new THREE.Vector3().fromArray(config.normal);
  const colAxis = new THREE.Vector3().fromArray(config.col);
  const upAxis = new THREE.Vector3().fromArray(config.up);

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">\n`;
  svgContent += `<defs>\n`;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      svgContent += `  <clipPath id="clip-${r}-${c}">\n`;
      svgContent += `    <rect x="${c * tile}" y="${r * tile}" width="${tile}" height="${tile}"/>\n`;
      svgContent += `  </clipPath>\n`;
    }
  }
  svgContent += `</defs>\n`;

  if (!isTransparent) {
    svgContent += `<rect width="${size}" height="${size}" fill="${cubeColor}" />\n`;
  }

  cubies
    .filter((cubie) => Math.round(cubie.position[config.axis]) === config.layer)
    .forEach((cubie) => {
      const faceIndex = localFaceNormals.findIndex(
        (localNormal) =>
          localNormal.clone().applyQuaternion(cubie.quaternion).dot(normal) >
          0.999,
      );
      const material = cubie.material[faceIndex];
      const meta = materialMeta.get(material);

      if (faceIndex < 0 || !meta) return;

      const col = Math.round(cubie.position.dot(colAxis)) + 1;
      const row = 1 - Math.round(cubie.position.dot(upAxis));
      if (row < 0 || row > 2 || col < 0 || col > 2) return;

      const axes = localTextureAxes[faceIndex];
      const worldU = new THREE.Vector3()
        .fromArray(axes.u)
        .applyQuaternion(cubie.quaternion);
      const worldUp = new THREE.Vector3()
        .fromArray(axes.up)
        .applyQuaternion(cubie.quaternion);
      const ux = Math.round(worldU.dot(colAxis));
      const uy = Math.round(-worldU.dot(upAxis));
      const vx = Math.round(-worldUp.dot(colAxis));
      const vy = Math.round(worldUp.dot(upAxis));

      const origInput = document.querySelector(
        `input[data-face="${meta.face}"]`,
      );
      const char = origInput ? origInput.value || " " : " ";

      const origR = Math.floor(meta.tileIndex / 3);
      const origC = meta.tileIndex % 3;

      const dx = tile * 1.5 - (origC + 0.5) * tile;
      const dy = tile * 1.5 - (origR + 0.5) * tile;

      const cx = (col + 0.5) * tile;
      const cy = (row + 0.5) * tile;

      // Adobe Illustrator/Figma 호환을 위한 Y 보정치 (Unbounded 폰트 기준)
      const baselineY = dy + 350;

      if (!isTransparent) {
        svgContent += `<rect x="${col * tile}" y="${row * tile}" width="${tile}" height="${tile}" fill="${cubeColor}" clip-path="url(#clip-${row}-${col})"/>\n`;
      }

      // SVG 특성상 text에 & 등 특수문자 이스케이프 필요
      const safeChar = char
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      svgContent += `<g clip-path="url(#clip-${row}-${col})">\n`;
      svgContent += `  <g transform="translate(${cx}, ${cy}) matrix(${ux}, ${uy}, ${vx}, ${vy}, 0, 0)">\n`;
      svgContent += `    <text x="${dx}" y="${baselineY}" text-anchor="middle" font-family="'Unbounded', 'Arial Black', sans-serif" font-weight="900" font-size="1000" fill="${textColor}">${safeChar}</text>\n`;
      svgContent += `  </g>\n`;
      svgContent += `</g>\n`;
    });

  svgContent += `</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  downloadBlob(blob, `${getExportPrefix()}-${face}.svg`);
}

async function exportBatch() {
  const target = document.querySelector('input[name="exportTarget"]:checked');
  const bgInput = document.querySelector('input[name="exportBg"]:checked');
  const formatInput = document.querySelector(
    'input[name="exportFormat"]:checked',
  );

  if (!target || !bgInput || !formatInput) return;

  const isObject = target.value === "object";
  const isTransparent = bgInput.value === "transparent";
  const format = formatInput.value;

  exportBtn.disabled = true;
  exportBtn.textContent = "EXPORTING...";

  try {
    if (isObject) {
      const sizeInput = document.getElementById("exportSize");
      const size = sizeInput ? parseInt(sizeInput.value, 10) : 3060;
      exportObjectPNG(size, isTransparent);
    } else {
      const selectedFaces = Array.from(
        document.querySelectorAll(".face-checks input:checked"),
      ).map((cb) => cb.value);
      if (selectedFaces.length === 0) {
        alert("Please select at least one face.");
        return;
      }
      for (const face of selectedFaces) {
        if (format === "svg") {
          exportFaceSVG(face, isTransparent);
        } else {
          exportFacePNG(face, isTransparent);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (e) {
    console.error("Export error:", e);
    alert("An error occurred during export.");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "EXPORT";
  }
}

exportBtn?.addEventListener("click", exportBatch);
