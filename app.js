/* ================================================================
   PIECES 앱 — 코드 색인 (CODE INDEX)
   ----------------------------------------------------------------
   01. CONFIG / CONSTANTS (설정 및 상수)
       - [조절값] 셔플 / 회전 / 카메라 / 렌더링 / 녹화 설정
       - 좌표축 및 면(Face) 매핑 데이터
       - 색상 팔레트 상수
   02. APPLICATION STATE (중앙 집중 상태 관리)
       - [State] 색상, 시점, 인터랙션, 히스토리(Undo/Redo), 내보내기 선택 상태
   03. DOM REFERENCES (DOM 참조 캐싱)
       - 캔버스, 뷰포트, 컨트롤, 입력, 팔레트, 카드 UI, 녹화 모달 캐싱
   04. THREE.JS INITIALIZATION (3D 렌더러 및 씬 초기화)
       - Renderer (preserveDrawingBuffer 활성화), EffectComposer, Passes
       - Scene, Camera, Lights, Group Hierarchy
       - Viewport Resize Observer
   05. CUBE / CUBIE CREATION & RESET (큐브 조각 생성 및 초기 상태 백업)
       - Box Geometry, 27개 Cubie 배치 및 초기 변환 행렬 백업/복원
   06. FACE TEXTURE / INPUT (면 텍스처 렌더링)
       - 고해상도 2D 캔버스 글자 렌더링 및 3x3 타일 분할
   07. FACE TILE QUERY (3D 면-타일 매핑 분석 전담)
       - [조사관] getVisibleTilesForFace(): 특정 면의 9개 타일 상태 쿼리
   08. TURN SYSTEM (회전 시스템 및 Undo/Redo 연동)
       - 08-1. 회전 후 각도 보정 (snapCubieRotation)
       - 08-2. 단일 레이어 회전 (turn)
       - 08-3. 중앙 레이어 회전 (middleTurn)
       - 08-4. 2개 레이어 회전 (wideTurn)
       - 08-5. 되돌리기 / 다시실행 / 초기화 실행 로직
   09. SHUFFLE (셔플 회전 시퀀스 & 순차 실행 엔진)
       - 확률 기반 무작위 회전 시퀀스 생성 및 순차 실행
   10. CAMERA / DRAG (시점 조작 및 마우스/터치 인터랙션)
       - 마우스/터치 드래그, 더블클릭 시점 리셋, 휠 줌, 키보드 단축키
   11. AUTO ROTATION (자동 회전)
       - 비조작 시 자동 요(Yaw) 회전 및 댐핑 보간
   12. FACE PREVIEW (2x3 카드 썸네일 미리보기)
       - 6개 면의 실시간 2D 타일 상태 재구성 렌더링 및 클릭 카메라 이동
   13. BACKGROUND / OUTLINE (배경 및 아웃라인 동기화)
       - 배경색 / 큐브색 / 글자색 / 실루엣 아웃라인 동기화
   14. EXPORT (이미지 및 비디오 내보내기 엔진)
       - 14-1. 내보내기 카드 UI 헬퍼 및 유틸리티
       - 14-2. 3D 오브젝트 PNG 내보내기
       - 14-3. 2D 면 PNG 내보내기
       - 14-4. 2D 면 SVG 벡터 내보내기
       - 14-5. 비디오 녹화 모달 및 진행률 헬퍼
       - 14-6. 3D 오브젝트 셔플 비디오 녹화
       - 14-7. 2D 선택된 면별 개별 독립 비디오 녹화 및 개별 다운로드
   15. UI EVENT LISTENERS (UI 이벤트 리스너 연결)
       - 텍스트 입력, 면 카드 클릭, 회전 버튼, 단축키 바인딩
   16. RENDER LOOP & INITIALIZATION (렌더 루프 및 실행 시작)
       - 초기 렌더링 시작 및 RAF 애니메이션 루프
   ================================================================ */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ================================================================
   01. CONFIG / CONSTANTS (설정 및 상수)
   ================================================================ */

// [조절값] 큐브 6개 면 이름 정의
const FACE_NAMES = ["front", "right", "back", "left", "top", "bottom"];

// [조절값] 셔플 동작 파라미터
const SHUFFLE_COUNT = 15;                       // 셔플 시 회전할 총 횟수
const SHUFFLE_DELAY_MIN = 60;                   // 각 회전 사이 최소 대기 시간 (ms)
const SHUFFLE_DELAY_MAX = 130;                  // 각 회전 사이 최대 대기 시간 (ms)
const SHUFFLE_TURN_PROBABILITY = 0.375;         // 1열 회전(turn) 확률 (37.5%)
const SHUFFLE_MIDDLE_TURN_PROBABILITY = 0.375;  // 중앙열 회전(middleTurn) 확률 (37.5%)
const SHUFFLE_WIDE_TURN_PROBABILITY = 0.25;     // 2열 회전(wideTurn) 확률 (25%)

// [조절값] 회전 애니메이션 속도 및 Easing 계수
const TURN_DURATION_MIN = 160;                  // 단일/중앙열 회전 최소 시간 (ms)
const TURN_DURATION_MAX = 280;                  // 단일/중앙열 회전 최대 시간 (ms)
const WIDE_TURN_DURATION = 280;                 // 2열 회전 고정 시간 (ms)
const TURN_EASE_OVERSHOOT = 2.0;                // 단일/중앙열 오버슛 Easing 계수
const WIDE_TURN_EASE_OVERSHOOT = 1.8;           // 2열 회전 오버슛 Easing 계수

// [조절값] 카메라 및 시점 조작 파라미터
const CAMERA_FOV = 35;                          // 카메라 화각(FOV)
const INITIAL_CAMERA_POS = [6.5, 5.5, 7.5];     // 카메라 초기 좌표 (x, y, z)
const INITIAL_CAMERA_DISTANCE = 11.25;          // 카메라 초기 중심 거리
const ZOOM_MIN = 5.5;                           // 휠 줌 최소 거리
const ZOOM_MAX = 17.0;                          // 휠 줌 최대 거리
const ZOOM_SENSITIVITY = 0.008;                 // 휠 줌 감도
const INITIAL_PITCH = -24;                      // 초기 상하 회전각 (도)
const INITIAL_YAW = -33;                        // 초기 좌우 회전각 (도)
const PITCH_LIMIT = 88;                         // 상하 회전 최대 제한각 (도, 뒤집힘 방지 및 상/하면 정면 뷰 최적화)
const DRAG_SENSITIVITY = 0.24;                  // 드래그 회전 감도
const KEYBOARD_STEP = 6;                        // 방향키 회전 단위 (도)
const KEYBOARD_SHIFT_STEP = 12;                 // Shift+방향키 회전 단위 (도)
const KEYBOARD_COOLDOWN_MS = 200;               // [조절값] 키보드 큐브 회전 입력 쿨타임 (ms)
let lastKeyboardTurnTime = 0;

// [조절값] 자동 회전 파라미터
const AUTO_ROTATE_SPEED = 0.2;                  // 자동 회전 속도 (프레임당 각도 증가량)
const ROTATION_DAMPING = 12;                    // 시점 보간 댐핑 계수

// [조절값] 실루엣 아웃라인 효과 설정
const OUTLINE_EDGE_STRENGTH = 4.5;               // 외곽선 강도 (자연스러운 안티앨리어싱 그라데이션)
const OUTLINE_EDGE_THICKNESS = 1.2;              // 외곽선 두께
const OUTLINE_EDGE_GLOW = 0;                     // 외곽선 글로우 강도
const OUTLINE_HIDDEN_EDGE_COLOR = "#ffffff";    // 가려진 면의 기본 외곽선 색상
const CUBIE_EDGE_COLOR = 0x5e5e5e;              // 각 피스 메쉬 경계선 색상

// [조절값] 텍스처 및 이미지 내보내기 해상도 설정
const TEXTURE_TILE_SIZE = 512;                  // 개별 피스 캔버스 텍스처 해상도 (px)
const FACE_RENDER_SIZE = 1536;                  // 한 면 글자 생성 원본 캔버스 크기 (px)
const DEFAULT_EXPORT_SIZE = 3060;               // 이미지 내보내기 해상도 기본값 (px)

// [조절값] 비디오 녹화 전용 해상도 (1:1 정사각형 1080p 고화질 최적화)
const VIDEO_OBJECT_SIZE = 1080;                 // 3D 큐브 비디오 가로/세로 해상도 (1080x1080)
const VIDEO_FACE_SIZE = 1080;                   // 개별 2D 면 비디오 가로/세로 해상도 (1080x1080)
const VIDEO_BITRATE = 6_000_000;                // 비디오 녹화 비트레이트 (6Mbps)

// [조절값] 비디오 녹화 시작 전/종료 후 대기 시간 (ms)
const RECORD_START_DELAY = 800;                 // 녹화 시작 후 첫 회전 시작 전 정지 상태 녹화 시간 (ms)
const RECORD_END_DELAY = 1000;                  // 모든 셔플 회전 완료 후 녹화 정지 전 정지 상태 녹화 시간 (ms)

// [조절값] 큐브 구조 상수
const CUBE_SPACING = 1;                         // 피스 간 격자 간격

// 큐브 회전축 및 레이어 설정
const movesConfig = {
  R: { axis: "x", layer: 1, cwAngle: -Math.PI / 2 },
  L: { axis: "x", layer: -1, cwAngle: Math.PI / 2 },
  U: { axis: "y", layer: 1, cwAngle: -Math.PI / 2 },
  D: { axis: "y", layer: -1, cwAngle: Math.PI / 2 },
  F: { axis: "z", layer: 1, cwAngle: -Math.PI / 2 },
  B: { axis: "z", layer: -1, cwAngle: Math.PI / 2 },
};

// 6개 면 썸네일 카메라 투영 각도
const faceAngles = {
  front: { yaw: 0, pitch: 0 },
  right: { yaw: -90, pitch: 0 },
  back: { yaw: 180, pitch: 0 },
  left: { yaw: 90, pitch: 0 },
  top: { yaw: 0, pitch: 85 },
  bottom: { yaw: 0, pitch: -85 },
};

// 6개 면 2D 미리보기 및 Export용 투영 설정
const previewConfig = {
  front: { axis: "z", layer: 1, normal: [0, 0, 1], col: [1, 0, 0], up: [0, 1, 0] },
  right: { axis: "x", layer: 1, normal: [1, 0, 0], col: [0, 0, -1], up: [0, 1, 0] },
  back: { axis: "z", layer: -1, normal: [0, 0, -1], col: [-1, 0, 0], up: [0, 1, 0] },
  left: { axis: "x", layer: -1, normal: [-1, 0, 0], col: [0, 0, 1], up: [0, 1, 0] },
  top: { axis: "y", layer: 1, normal: [0, 1, 0], col: [1, 0, 0], up: [0, 0, -1] },
  bottom: { axis: "y", layer: -1, normal: [0, -1, 0], col: [1, 0, 0], up: [0, 0, 1] },
};

// BoxGeometry 로컬 6개 면 법선 벡터
const localFaceNormals = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

// 로컬 면별 텍스처 2D 투영 축
const localTextureAxes = [
  { u: [0, 0, -1], up: [0, 1, 0] },
  { u: [0, 0, 1], up: [0, 1, 0] },
  { u: [1, 0, 0], up: [0, 0, -1] },
  { u: [1, 0, 0], up: [0, 0, 1] },
  { u: [1, 0, 0], up: [0, 1, 0] },
  { u: [-1, 0, 0], up: [0, 1, 0] },
];

// [조절값] 큐브 텍스트 지원 서체 레지스트리 (추후 원하는 서체만 1줄 추가하면 전체 파이프라인에 자동 연동)
const FONT_REGISTRY = [
  {
    id: "unbounded",
    name: "Unbounded",
    family: "'Unbounded', sans-serif",
    weight: "900",
    size: 1000,
    baselineOffset: 350,
  },
  {
    id: "pretendard",
    name: "Pretendard",
    family: "'Pretendard', sans-serif",
    weight: "900",
    size: 1000,
    baselineOffset: 350,
  },
  {
    id: "geist",
    name: "Geist",
    family: "'Geist', sans-serif",
    weight: "900",
    size: 1000,
    baselineOffset: 350,
  },
];

// 컬러 팔레트 목록 정의
const PALETTES = {
  textPalette: [
    "#ffffff", "#000000", "#ff3b30", "#ff9e16",
    "#ffd60a", "#30d158", "#0a84ff", "#bf5af2",
  ],
  cubePalette: [
    "#ffffff", "#000000", "#ff3b30", "#ff9e16",
    "#ffd60a", "#30d158", "#0a84ff", "#bf5af2",
  ],
  backgroundPalette: ["#000000", "#ffffff"],
};

/* ================================================================
   02. APPLICATION STATE (중앙 집중 상태 관리)
   ================================================================ */

const state = {
  color: {
    text: "#ffffff",
    cube: "#000000",
    outline: "#ffffff",
  },
  view: {
    pitch: INITIAL_PITCH,
    yaw: INITIAL_YAW,
    targetPitch: INITIAL_PITCH,
    targetYaw: INITIAL_YAW,
    cameraDistance: INITIAL_CAMERA_DISTANCE,
    autoRotate: true,
  },
  interaction: {
    turning: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    activePreviewFace: "front",
  },
  history: {
    undoStack: [],
    redoStack: [],
  },
  export: {
    selectedFaces: new Set(FACE_NAMES),
  },
  typography: {
    currentFontId: "unbounded",
  },
};

/* ================================================================
   03. DOM REFERENCES (DOM 참조 캐싱)
   ================================================================ */

const canvas = document.getElementById("view");
const stage = document.querySelector(".viewport");
const autoRotateToggle = document.getElementById("autoRotate");
const fontSelect = document.getElementById("fontSelect");
const unifiedWordInput = document.getElementById("unifiedWord");
const faceInputs = Array.from(document.querySelectorAll("input[data-face]"));
const shuffleButton = document.getElementById("shuffle");
const solveBtn = document.getElementById("solveBtn");
const turnButtons = document.querySelectorAll("[data-turn]");

// 히스토리 버튼 참조
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const resetCubeBtn = document.getElementById("resetCubeBtn");
const resetViewBtn = document.getElementById("resetViewBtn");

// 2x3 카드 썸네일 참조
const faceCards = document.querySelectorAll(".face-card");
const previewCanvases = Object.fromEntries(
  FACE_NAMES.map((face) => [
    face,
    document.querySelector(`[data-preview-canvas="${face}"]`),
  ]),
);

// 내보내기 카드형 제어기 참조
const modeTabs = document.querySelectorAll(".mode-tab");
const imageModeSection = document.getElementById("imageModeSection");
const videoModeSection = document.getElementById("videoModeSection");
const cardOptions = document.querySelectorAll(".card-option");
const exportResolutionPanel = document.getElementById("exportResolution");
const exportFacesSelector = document.getElementById("exportFacesSelector");
const svgFormatBtn = document.getElementById("svgFormatBtn");
const selectAllFacesBtn = document.getElementById("selectAllFacesBtn");
const faceChips = document.querySelectorAll(".face-chip");
const exportBtn = document.getElementById("exportBtn");
const recordBtn = document.getElementById("recordBtn");

// 화면 중앙 녹화 모달 참조
const recordModal = document.getElementById("recordModal");
const recordProgressFill = document.getElementById("recordProgressFill");
const recordProgressLabel = document.getElementById("recordProgressLabel");

/* ================================================================
   04. THREE.JS INITIALIZATION (3D 렌더러 및 씬 초기화)
   ================================================================ */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true, // 비디오 녹화 및 이미지 캡처 시 백버퍼 보존 필수
});
renderer.setPixelRatio(window.devicePixelRatio);

// GPU 하드웨어 4x MSAA 안티앨리어싱이 적용된 WebGLRenderTarget 생성
// 소프트웨어 블러(SMAA/FXAA) 없이 1px 피스 경계선과 글자 선명도를 100% 보존하면서 계단 현상 제거
const renderTarget = new THREE.WebGLRenderTarget(
  stage.clientWidth * window.devicePixelRatio,
  stage.clientHeight * window.devicePixelRatio,
  {
    samples: 4,
  },
);

const composer = new EffectComposer(renderer, renderTarget);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
camera.position.set(...INITIAL_CAMERA_POS);
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
outlinePass.edgeStrength = OUTLINE_EDGE_STRENGTH;
outlinePass.edgeThickness = OUTLINE_EDGE_THICKNESS;
outlinePass.edgeGlow = OUTLINE_EDGE_GLOW;
outlinePass.visibleEdgeColor.set(state.color.outline);
outlinePass.hiddenEdgeColor.set(OUTLINE_HIDDEN_EDGE_COLOR);

// 검정 외곽선이 가산 혼합(AdditiveBlending)으로 인해 0이 더해져 사라지는 현상 방지:
// overlayMaterial의 블렌딩을 CustomBlending(알파 혼합)으로 설정하여 흰색/검은색 배경 모두에서 선명하게 렌더링
if (outlinePass.overlayMaterial) {
  outlinePass.overlayMaterial.blending = THREE.CustomBlending;
  outlinePass.overlayMaterial.blendSrc = THREE.SrcAlphaFactor;
  outlinePass.overlayMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
  outlinePass.overlayMaterial.blendEquation = THREE.AddEquation;
}
composer.addPass(outlinePass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

scene.add(new THREE.HemisphereLight(0xffffff, 0x111827, 2.2));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(6, 9, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x91acdf, 0.7);
fillLight.position.set(-6, 2, -5);
scene.add(fillLight);

function applyRendererSize(w, h) {
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  outlinePass.setSize(w, h);
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  applyRendererSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(stage);
resize();

/* ================================================================
   05. CUBE / CUBIE CREATION & RESET (큐브 조각 생성 및 초기 상태 백업)
   ================================================================ */

const cubies = [];
const initialCubieStates = [];
const cubieGeometry = new THREE.BoxGeometry(1, 1, 1);

const internalMaterial = new THREE.MeshBasicMaterial({
  color: state.color.cube,
});

const faceTextures = {};
const faceMaterials = {};
const materialMeta = new WeakMap();

FACE_NAMES.forEach((face) => {
  faceTextures[face] = [];
  faceMaterials[face] = [];

  for (let i = 0; i < 9; i++) {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = TEXTURE_TILE_SIZE;
    textureCanvas.height = TEXTURE_TILE_SIZE;

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

function createCube() {
  for (let cx = -1; cx <= 1; cx++) {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cz = -1; cz <= 1; cz++) {
        const materials = [];

        if (cx === 1) {
          const pi = (1 - cy) * 3 + (1 - cz);
          materials.push(faceMaterials.right[pi]);
        } else {
          materials.push(internalMaterial);
        }

        if (cx === -1) {
          const pi = (1 - cy) * 3 + (cz + 1);
          materials.push(faceMaterials.left[pi]);
        } else {
          materials.push(internalMaterial);
        }

        if (cy === 1) {
          const pi = (cz + 1) * 3 + (cx + 1);
          materials.push(faceMaterials.top[pi]);
        } else {
          materials.push(internalMaterial);
        }

        if (cy === -1) {
          const pi = (1 - cz) * 3 + (cx + 1);
          materials.push(faceMaterials.bottom[pi]);
        } else {
          materials.push(internalMaterial);
        }

        if (cz === 1) {
          const pi = (1 - cy) * 3 + (cx + 1);
          materials.push(faceMaterials.front[pi]);
        } else {
          materials.push(internalMaterial);
        }

        if (cz === -1) {
          const pi = (1 - cy) * 3 + (1 - cx);
          materials.push(faceMaterials.back[pi]);
        } else {
          materials.push(internalMaterial);
        }

        const cubie = new THREE.Mesh(cubieGeometry, materials);

        // 큐브 피스 경계선: 지오메트리를 바깥으로 1.002배 확장하는 방식(외곽선 돌출 및 계단현상 원인)을 제거하고,
        // GPU polygonOffset을 적용하여 메쉬 표면에 정확히 밀착 렌더링
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(cubieGeometry),
          new THREE.LineBasicMaterial({
            color: CUBIE_EDGE_COLOR,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        cubie.add(edges);

        cubie.position.set(cx * CUBE_SPACING, cy * CUBE_SPACING, cz * CUBE_SPACING);

        cubeGroup.add(cubie);
        cubies.push(cubie);

        initialCubieStates.push({
          position: cubie.position.clone(),
          quaternion: cubie.quaternion.clone(),
        });
      }
    }
  }

  // OutlinePass의 실루엣 마스크 대상을 1px 와이어프레임 라인이 아닌 27개 솔리드 메쉬(cubies)로 지정
  // 와이어프레임 선이 실루엣 외곽선과 충돌하여 계단 현상 및 톱니 노이즈가 발생하는 현상 원천 차단
  outlinePass.selectedObjects = cubies;
}

/* ================================================================
   06. FACE TEXTURE / INPUT (면 텍스처 렌더링)
   ================================================================ */

function getCurrentFont() {
  return (
    FONT_REGISTRY.find((f) => f.id === state.typography.currentFontId) ||
    FONT_REGISTRY[0]
  );
}

function setCubeFont(fontId) {
  state.typography.currentFontId = fontId;
  updateAllTextures();
  updateFacePreviews();
}

function updateFaceTexture(faceName, char) {
  const SIZE = FACE_RENDER_SIZE;
  const TILE = SIZE / 3;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = SIZE;
  tempCanvas.height = SIZE;

  const ctx = tempCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = state.color.cube;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const fontConfig = getCurrentFont();
  ctx.fillStyle = state.color.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontConfig.weight} ${fontConfig.size}px ${fontConfig.family}`;
  ctx.fillText(char || " ", SIZE / 2, SIZE / 2);

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
  FACE_NAMES.forEach((face) => {
    const input = document.querySelector(`input[data-face="${face}"]`);
    const char = input ? input.value : " ";
    updateFaceTexture(face, char);
  });
}

/* ================================================================
   07. FACE TILE QUERY (3D 면-타일 매핑 분석 전담)
   ================================================================ */

function getVisibleTilesForFace(face) {
  const config = previewConfig[face];
  const normal = new THREE.Vector3().fromArray(config.normal);
  const colAxis = new THREE.Vector3().fromArray(config.col);
  const upAxis = new THREE.Vector3().fromArray(config.up);

  const matchedCubies = cubies.filter(
    (cubie) => Math.round(cubie.position[config.axis]) === config.layer,
  );

  const tiles = [];

  matchedCubies.forEach((cubie) => {
    const faceIndex = localFaceNormals.findIndex(
      (localNormal) =>
        localNormal.clone().applyQuaternion(cubie.quaternion).dot(normal) > 0.999,
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

    const meta = materialMeta.get(material);

    tiles.push({
      cubie,
      material,
      meta,
      image: material.map.image,
      col,
      row,
      ux,
      uy,
      vx,
      vy,
    });
  });

  return tiles;
}

/* ================================================================
   08. TURN SYSTEM (회전 시스템 및 Undo/Redo 연동)
   ================================================================ */

function snapCubieRotation(cubie) {
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

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = state.history.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = state.history.redoStack.length === 0;
  if (solveBtn) solveBtn.disabled = state.history.undoStack.length === 0;
}

function pushHistory(type, moveName, direction, isHistoryAction = false) {
  if (!isHistoryAction) {
    state.history.undoStack.push({ type, moveName, direction });
    state.history.redoStack = [];
    updateHistoryButtons();
  }
}

function turn(moveName, direction = 1, onComplete, isHistoryAction = false) {
  if (state.interaction.turning || !movesConfig[moveName]) {
    onComplete?.();
    return;
  }

  state.interaction.turning = true;
  pushHistory("turn", moveName, direction, isHistoryAction);

  const move = movesConfig[moveName];
  const axis = move.axis;
  const layer = move.layer;
  const angle = move.cwAngle * direction;

  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  const items = cubies.filter(
    (cubie) => Math.round(cubie.position[axis]) === layer,
  );

  items.forEach((cubie) => pivot.attach(cubie));

  const duration = THREE.MathUtils.randInt(TURN_DURATION_MIN, TURN_DURATION_MAX);
  const start = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const ease = TURN_EASE_OVERSHOOT;
    const t = progress - 1;
    const eased = t * t * ((ease + 1) * t + ease) + 1;

    pivot.rotation[axis] = angle * eased;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      pivot.updateMatrixWorld(true);

      items.forEach((cubie) => {
        cubeGroup.attach(cubie);
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);
        snapCubieRotation(cubie);
      });

      pivot.removeFromParent();
      state.interaction.turning = false;
      updateFacePreviews();
      onComplete?.();
    }
  }

  requestAnimationFrame(frame);
}

function middleTurn(moveName, direction = 1, onComplete, isHistoryAction = false) {
  if (state.interaction.turning || !movesConfig[moveName]) {
    onComplete?.();
    return;
  }

  state.interaction.turning = true;
  pushHistory("middleTurn", moveName, direction, isHistoryAction);

  const move = movesConfig[moveName];
  const axis = move.axis;
  const angle = move.cwAngle * direction;

  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  const items = cubies.filter((cubie) => {
    return Math.round(cubie.position[axis]) === 0;
  });

  items.forEach((cubie) => pivot.attach(cubie));

  const duration = THREE.MathUtils.randInt(TURN_DURATION_MIN, TURN_DURATION_MAX);
  const start = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const ease = TURN_EASE_OVERSHOOT;
    const t = progress - 1;
    const eased = t * t * ((ease + 1) * t + ease) + 1;

    pivot.rotation[axis] = angle * eased;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      pivot.updateMatrixWorld(true);

      items.forEach((cubie) => {
        cubeGroup.attach(cubie);
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);
        snapCubieRotation(cubie);
      });

      pivot.removeFromParent();
      state.interaction.turning = false;
      updateFacePreviews();
      onComplete?.();
    }
  }

  requestAnimationFrame(frame);
}

function wideTurn(moveName, direction = 1, onComplete, isHistoryAction = false) {
  if (state.interaction.turning || !movesConfig[moveName]) {
    onComplete?.();
    return;
  }

  state.interaction.turning = true;
  pushHistory("wideTurn", moveName, direction, isHistoryAction);

  const move = movesConfig[moveName];
  const axis = move.axis;
  const outerLayer = move.layer;
  const angle = move.cwAngle * direction;

  const pivot = new THREE.Group();
  cubeGroup.add(pivot);

  const items = cubies.filter((cubie) => {
    const coordinate = Math.round(cubie.position[axis]);
    return coordinate === outerLayer || coordinate === 0;
  });

  items.forEach((cubie) => pivot.attach(cubie));

  const duration = WIDE_TURN_DURATION;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const ease = WIDE_TURN_EASE_OVERSHOOT;
    const t = progress - 1;
    const eased = t * t * ((ease + 1) * t + ease) + 1;

    pivot.rotation[axis] = angle * eased;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      pivot.updateMatrixWorld(true);

      items.forEach((cubie) => {
        cubeGroup.attach(cubie);
        cubie.position.x = Math.round(cubie.position.x);
        cubie.position.y = Math.round(cubie.position.y);
        cubie.position.z = Math.round(cubie.position.z);
        snapCubieRotation(cubie);
      });

      pivot.removeFromParent();
      state.interaction.turning = false;
      updateFacePreviews();
      onComplete?.();
    }
  }

  requestAnimationFrame(frame);
}

const actionMap = {
  turn,
  middleTurn,
  wideTurn,
};

function undo() {
  if (state.interaction.turning || state.history.undoStack.length === 0) return;

  const lastMove = state.history.undoStack.pop();
  state.history.redoStack.push(lastMove);
  updateHistoryButtons();

  const fn = actionMap[lastMove.type];
  if (fn) {
    fn(lastMove.moveName, -lastMove.direction, null, true);
  }
}

function redo() {
  if (state.interaction.turning || state.history.redoStack.length === 0) return;

  const nextMove = state.history.redoStack.pop();
  state.history.undoStack.push(nextMove);
  updateHistoryButtons();

  const fn = actionMap[nextMove.type];
  if (fn) {
    fn(nextMove.moveName, nextMove.direction, null, true);
  }
}

function resetCube() {
  if (state.interaction.turning) return;

  cubies.forEach((cubie, index) => {
    const initial = initialCubieStates[index];
    cubie.position.copy(initial.position);
    cubie.quaternion.copy(initial.quaternion);
  });

  state.history.undoStack = [];
  state.history.redoStack = [];
  updateHistoryButtons();

  updateAllTextures();
  updateFacePreviews();
}

function resetView() {
  state.view.targetPitch = INITIAL_PITCH;
  state.view.targetYaw = INITIAL_YAW;
  state.view.cameraDistance = INITIAL_CAMERA_DISTANCE;
  camera.position.setLength(INITIAL_CAMERA_DISTANCE);
  autoRotateToggle.checked = true;
}

/* ================================================================
   09. SHUFFLE (셔플 회전 시퀀스 & 순차 실행 엔진)
   ================================================================ */

function shuffleCube(onComplete, onStepProgress) {
  if (state.interaction.turning) {
    state.interaction.turning = false;
  }

  const sequence = Array.from({ length: SHUFFLE_COUNT }, () => {
    const face = ["R", "L", "U", "D", "F", "B"][Math.floor(Math.random() * 6)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    return [face, dir];
  });

  let index = 0;

  const next = () => {
    if (index >= sequence.length) {
      onComplete?.();
      return;
    }

    const currentStep = index + 1;
    onStepProgress?.(currentStep, sequence.length);

    const [face, dir] = sequence[index++];
    const roll = Math.random();

    let rotateFn;
    if (roll < SHUFFLE_TURN_PROBABILITY) {
      rotateFn = turn;
    } else if (roll < (SHUFFLE_TURN_PROBABILITY + SHUFFLE_MIDDLE_TURN_PROBABILITY)) {
      rotateFn = middleTurn;
    } else {
      rotateFn = wideTurn;
    }

    rotateFn(face, dir, () => {
      setTimeout(next, THREE.MathUtils.randInt(SHUFFLE_DELAY_MIN, SHUFFLE_DELAY_MAX));
    });
  };

  next();
}

function solveCube(onComplete, onStepProgress) {
  if (state.history.undoStack.length === 0) {
    updateHistoryButtons();
    onComplete?.();
    return;
  }

  state.interaction.turning = false;
  const totalMoves = state.history.undoStack.length;
  let currentStep = 0;

  const nextSolve = () => {
    if (state.history.undoStack.length === 0) {
      state.interaction.turning = false;
      updateHistoryButtons();
      onComplete?.();
      return;
    }

    currentStep++;
    onStepProgress?.(currentStep, totalMoves);

    const lastMove = state.history.undoStack.pop();
    state.history.redoStack.push(lastMove);
    updateHistoryButtons();

    const fn = actionMap[lastMove.type];
    if (fn) {
      fn(
        lastMove.moveName,
        -lastMove.direction,
        () => {
          setTimeout(
            nextSolve,
            THREE.MathUtils.randInt(SHUFFLE_DELAY_MIN, SHUFFLE_DELAY_MAX),
          );
        },
        true,
      );
    } else {
      setTimeout(nextSolve, 50);
    }
  };

  nextSolve();
}

/* ================================================================
   10. CAMERA / DRAG (시점 조작 및 마우스/터치 인터랙션)
   ================================================================ */

function rotateRig() {
  rig.rotation.set(
    THREE.MathUtils.degToRad(state.view.pitch),
    THREE.MathUtils.degToRad(state.view.yaw),
    0,
  );
}

stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".viewport-hud")) {
    return;
  }
  state.interaction.dragging = true;
  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;
  stage.classList.add("is-dragging");
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!state.interaction.dragging) {
    return;
  }

  state.view.targetYaw += (event.clientX - state.interaction.lastX) * DRAG_SENSITIVITY;
  state.view.targetPitch -= (event.clientY - state.interaction.lastY) * DRAG_SENSITIVITY;
  state.view.targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.view.targetPitch));

  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;

  rotateRig();
});

stage.addEventListener("pointerup", () => {
  state.interaction.dragging = false;
  stage.classList.remove("is-dragging");
});

stage.addEventListener("pointercancel", () => {
  state.interaction.dragging = false;
  stage.classList.remove("is-dragging");
});

stage.addEventListener("dblclick", (event) => {
  if (event.target.closest(".viewport-hud")) {
    return;
  }
  resetView();
});

stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    state.view.cameraDistance = THREE.MathUtils.clamp(
      state.view.cameraDistance + event.deltaY * ZOOM_SENSITIVITY,
      ZOOM_MIN,
      ZOOM_MAX,
    );
    camera.position.setLength(state.view.cameraDistance);
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  const focusedInput = document.activeElement?.matches("input, textarea, select");
  if (focusedInput) return;

  const isCmdOrCtrl = event.metaKey || event.ctrlKey;

  // 되돌리기 단축키 (Cmd/Ctrl + Z)
  if (isCmdOrCtrl && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
    return;
  }

  // 다시실행 단축키 (Cmd/Ctrl + Shift + Z 또는 Ctrl + Y)
  if ((isCmdOrCtrl && event.shiftKey && event.key.toLowerCase() === "z") || (isCmdOrCtrl && event.key.toLowerCase() === "y")) {
    event.preventDefault();
    redo();
    return;
  }

  // 스페이스바: 셔플 실행
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    shuffleCube();
    return;
  }

  // ESC: 시점 각도 초기화
  if (event.key === "Escape") {
    event.preventDefault();
    resetView();
    return;
  }

  // 수동 키보드 회전 ('R', 'L', 'U', 'D', 'F', 'B')
  const key = event.key.toUpperCase();
  if (["R", "L", "U", "D", "F", "B"].includes(key)) {
    event.preventDefault();
    if (event.repeat) return; // 키 꾹 누름 반복 방지
    const now = performance.now();
    if (now - lastKeyboardTurnTime < KEYBOARD_COOLDOWN_MS || state.interaction.turning) {
      return; // 쿨타임 및 회전 중 중복 실행 방지
    }
    lastKeyboardTurnTime = now;
    const dir = event.shiftKey ? -1 : 1;
    turn(key, dir);
    return;
  }

  // 방향키 시점 조작
  const step = event.shiftKey ? KEYBOARD_SHIFT_STEP : KEYBOARD_STEP;
  if (event.key === "ArrowLeft") state.view.targetYaw -= step;
  else if (event.key === "ArrowRight") state.view.targetYaw += step;
  else if (event.key === "ArrowUp") state.view.targetPitch = Math.min(PITCH_LIMIT, state.view.targetPitch + step);
  else if (event.key === "ArrowDown") state.view.targetPitch = Math.max(-PITCH_LIMIT, state.view.targetPitch - step);
  else return;

  event.preventDefault();
});

stage.addEventListener("dragstart", (event) => event.preventDefault());
stage.addEventListener("selectstart", (event) => event.preventDefault());

/* ================================================================
   11. AUTO ROTATION (자동 회전)
   ================================================================ */

// 16. RENDER LOOP에서 처리

/* ================================================================
   12. FACE PREVIEW (2x3 카드 썸네일 미리보기)
   ================================================================ */

function updateFacePreviews() {
  Object.entries(previewConfig).forEach(([face]) => {
    const previewCanvas = previewCanvases[face];
    if (!previewCanvas) return;

    const context = previewCanvas.getContext("2d");
    const size = previewCanvas.width;
    const tile = size / 3;

    context.fillStyle = state.color.cube;
    context.fillRect(0, 0, size, size);

    const tiles = getVisibleTilesForFace(face);
    tiles.forEach(({ image, col, row, ux, uy, vx, vy }) => {
      context.save();
      context.beginPath();
      context.rect(col * tile, row * tile, tile, tile);
      context.clip();
      context.translate((col + 0.5) * tile, (row + 0.5) * tile);
      context.transform(ux, uy, vx, vy, 0, 0);
      context.drawImage(image, -tile / 2, -tile / 2, tile, tile);
      context.restore();
    });
  });
}

faceCards.forEach((card) => {
  card.addEventListener("click", () => {
    faceCards.forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    const face = card.dataset.preview;
    state.interaction.activePreviewFace = face;
    autoRotateToggle.checked = false;

    const angles = faceAngles[face];
    const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;
    const currentYaw = normalizeAngle(state.view.targetYaw);
    const target = normalizeAngle(angles.yaw);

    let diff = target - currentYaw;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    state.view.targetYaw += diff;
    state.view.targetPitch = angles.pitch;
  });
});

/* ================================================================
   13. BACKGROUND / OUTLINE (배경 및 아웃라인 동기화)
   ================================================================ */

function createPalette(id, colors, callback) {
  const palette = document.getElementById(id);
  if (!palette) return;

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
  state.color.text = color;
  updateAllTextures();
  updateFacePreviews();
});

createPalette("cubePalette", PALETTES.cubePalette, (color) => {
  state.color.cube = color;
  internalMaterial.color.set(color);
  updateAllTextures();
  updateFacePreviews();
});

createPalette("backgroundPalette", PALETTES.backgroundPalette, (color) => {
  const isWhite = color.toLowerCase() === "#ffffff";
  stage.style.backgroundColor = color;

  if (isWhite) {
    stage.style.backgroundImage = `
      linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px)
    `;
  } else {
    stage.style.backgroundImage = `
      linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)
    `;
  }

  state.color.outline = isWhite ? "#000000" : "#ffffff";
  outlinePass.visibleEdgeColor.set(state.color.outline);
  outlinePass.hiddenEdgeColor.set(state.color.outline);

  if (state.color.cube === "#000000" || state.color.cube === "#ffffff") {
    state.color.cube = isWhite ? "#ffffff" : "#000000";
    internalMaterial.color.set(state.color.cube);
  }

  if (state.color.text === "#ffffff" || state.color.text === "#000000") {
    state.color.text = isWhite ? "#000000" : "#ffffff";
  }

  updateAllTextures();
  updateFacePreviews();
});

/* ================================================================
   14. EXPORT (이미지 및 비디오 내보내기 엔진)
   ================================================================ */

// ----------------------------------------------------------------
// 14-1. 내보내기 카드 UI 헬퍼 및 유틸리티
// ----------------------------------------------------------------

function getCardGroupValue(groupName) {
  const group = document.querySelector(`[data-control-group="${groupName}"]`);
  const activeCard = group?.querySelector(".card-option.is-active, .mode-tab.is-active");
  return activeCard?.dataset.val || "";
}

function updateExportUI() {
  const activeMode = getCardGroupValue("exportMode") || "image";
  const isVideo = activeMode === "video";

  if (imageModeSection) imageModeSection.hidden = isVideo;
  if (videoModeSection) videoModeSection.hidden = !isVideo;

  const target = getCardGroupValue("exportTarget");
  const isObject = target === "object";
  const faceCount = state.export.selectedFaces.size;

  if (isObject) {
    if (exportResolutionPanel) exportResolutionPanel.hidden = isVideo;
    if (exportFacesSelector) exportFacesSelector.hidden = true;
    if (svgFormatBtn) svgFormatBtn.disabled = true;

    const format = getCardGroupValue("exportFormat");
    if (format === "svg") {
      const pngBtn = document.querySelector('[data-control-group="exportFormat"] [data-val="png"]');
      if (pngBtn) {
        document.querySelectorAll('[data-control-group="exportFormat"] .card-option').forEach((b) => b.classList.remove("is-active"));
        pngBtn.classList.add("is-active");
      }
    }
  } else {
    if (exportResolutionPanel) exportResolutionPanel.hidden = true;
    if (exportFacesSelector) exportFacesSelector.hidden = false;
    if (svgFormatBtn) svgFormatBtn.disabled = false;
  }

  const format = getCardGroupValue("exportFormat");
  const isSvg = format === "svg";
  if (isSvg && exportResolutionPanel) {
    exportResolutionPanel.hidden = true;
  }

  // 버튼 레이블에 다운로드될 파일/영상 개수 실시간 표시
  if (exportBtn) {
    exportBtn.textContent = isObject
      ? "EXPORT IMAGE (1 File)"
      : `EXPORT IMAGE (${faceCount} Files)`;
  }
  if (recordBtn) {
    const recordAction = getCardGroupValue("recordAction") || "shuffle";
    const actionName = recordAction === "solve" ? "SOLVE" : "SHUFFLE";
    recordBtn.textContent = isObject
      ? `RECORD ${actionName} (1 Video)`
      : `RECORD ${actionName} (${faceCount} Videos)`;
  }
}

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    modeTabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    updateExportUI();
  });
});

cardOptions.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const parentGroup = btn.closest("[data-control-group]");
    if (!parentGroup) return;

    parentGroup.querySelectorAll(".card-option").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    updateExportUI();
  });
});

updateExportUI();

faceChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    const face = chip.dataset.chipFace;
    if (state.export.selectedFaces.has(face)) {
      if (state.export.selectedFaces.size > 1) {
        state.export.selectedFaces.delete(face);
        chip.classList.remove("is-selected");
      }
    } else {
      state.export.selectedFaces.add(face);
      chip.classList.add("is-selected");
    }
    updateExportUI();
  });
});

selectAllFacesBtn?.addEventListener("click", () => {
  const allSelected = state.export.selectedFaces.size === FACE_NAMES.length;
  if (allSelected) {
    state.export.selectedFaces.clear();
    state.export.selectedFaces.add("front");
    faceChips.forEach((chip) => {
      chip.classList.toggle("is-selected", chip.dataset.chipFace === "front");
    });
  } else {
    FACE_NAMES.forEach((f) => state.export.selectedFaces.add(f));
    faceChips.forEach((chip) => chip.classList.add("is-selected"));
  }
  updateExportUI();
});

function getExportSize() {
  const val = getCardGroupValue("exportSize");
  return val ? parseInt(val, 10) : DEFAULT_EXPORT_SIZE;
}

function getExportPrefix() {
  return (
    FACE_NAMES
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

function getCurrentBackgroundColor() {
  const color = getComputedStyle(stage).backgroundColor;
  if (!color || color === "rgba(0, 0, 0, 0)") {
    return "#000000";
  }
  return color;
}

function getExportOutlineColor(bgColor) {
  const color = new THREE.Color(bgColor);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// ----------------------------------------------------------------
// 14-2. 3D 오브젝트 PNG 내보내기
// ----------------------------------------------------------------
function exportObjectPNG(size, isTransparent) {
  const savedW = stage.clientWidth;
  const savedH = stage.clientHeight;
  const savedAspect = camera.aspect;
  const savedClearColor = renderer.getClearColor(new THREE.Color());
  const savedClearAlpha = renderer.getClearAlpha();
  const savedOutlineEnabled = outlinePass.enabled;
  const savedThickness = outlinePass.edgeThickness;
  const savedStrength = outlinePass.edgeStrength;

  try {
    const scaleFactor = Math.max(1, size / 720);
    outlinePass.edgeThickness = Math.max(2, Math.round(OUTLINE_EDGE_THICKNESS * scaleFactor));
    outlinePass.edgeStrength = Math.max(6, Math.round(OUTLINE_EDGE_STRENGTH * 1.5));
    outlinePass.enabled = true;

    if (isTransparent) {
      outlinePass.enabled = false;
      renderer.setClearColor(0x000000, 0);
    } else {
      outlinePass.enabled = true;
      const bgVal = getCardGroupValue("exportBg");
      const bgColor = bgVal === "current" ? getCurrentBackgroundColor() : "#000000";

      renderer.setClearColor(bgColor, 1);
      const exportOutlineColor = getExportOutlineColor(bgColor);
      outlinePass.visibleEdgeColor.set(exportOutlineColor);
      outlinePass.hiddenEdgeColor.set(exportOutlineColor);
    }

    applyRendererSize(size, size);
    camera.aspect = 1;
    camera.updateProjectionMatrix();

    renderer.setRenderTarget(null);
    composer.render();

    const dataURL = canvas.toDataURL("image/png");
    downloadDataURL(dataURL, `${getExportPrefix()}-object.png`);
  } finally {
    applyRendererSize(savedW, savedH);
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();

    outlinePass.visibleEdgeColor.set(state.color.outline);
    outlinePass.hiddenEdgeColor.set(state.color.outline);
    outlinePass.edgeThickness = savedThickness;
    outlinePass.edgeStrength = savedStrength;
    renderer.setClearColor(savedClearColor, savedClearAlpha);
    outlinePass.enabled = savedOutlineEnabled;

    composer.render();
  }
}

// ----------------------------------------------------------------
// 14-3. 2D 면 PNG 내보내기
// ----------------------------------------------------------------
function exportFacePNG(face, isTransparent) {
  const size = getExportSize();
  const tile = size / 3;

  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = size;
  faceCanvas.height = size;
  const context = faceCanvas.getContext("2d");

  if (!isTransparent) {
    context.fillStyle = state.color.cube;
    context.fillRect(0, 0, size, size);
  } else {
    context.clearRect(0, 0, size, size);
  }

  const tiles = getVisibleTilesForFace(face);
  tiles.forEach(({ image, col, row, ux, uy, vx, vy }) => {
    context.save();
    if (!isTransparent) {
      context.fillStyle = state.color.cube;
      context.fillRect(col * tile, row * tile, tile, tile);
    }
    context.beginPath();
    context.rect(col * tile, row * tile, tile, tile);
    context.clip();
    context.translate((col + 0.5) * tile, (row + 0.5) * tile);
    context.transform(ux, uy, vx, vy, 0, 0);
    context.drawImage(image, -tile / 2, -tile / 2, tile, tile);
    context.restore();
  });

  downloadDataURL(
    faceCanvas.toDataURL("image/png"),
    `${getExportPrefix()}-${face}.png`,
  );
}

// ----------------------------------------------------------------
// 14-4. 2D 면 SVG 벡터 내보내기
// ----------------------------------------------------------------
function exportFaceSVG(face, isTransparent) {
  const size = FACE_RENDER_SIZE;
  const tile = size / 3;

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
    svgContent += `<rect width="${size}" height="${size}" fill="${state.color.cube}" />\n`;
  }

  const tiles = getVisibleTilesForFace(face);
  tiles.forEach(({ meta, col, row, ux, uy, vx, vy }) => {
    if (!meta) return;

    const origInput = document.querySelector(
      `input[data-face="${meta.face}"]`,
    );
    const char = origInput ? origInput.value || " " : " ";

    const origR = Math.floor(meta.tileIndex / 3);
    const origC = meta.tileIndex % 3;

    const dx = tile * 1.5 - (origC + 0.5) * tile;
    const dy = tile * 1.5 - (origR + 0.5) * tile;

    const fontConfig = getCurrentFont();
    const baselineY = dy + (fontConfig.baselineOffset || 350);

    if (!isTransparent) {
      svgContent += `<rect x="${col * tile}" y="${row * tile}" width="${tile}" height="${tile}" fill="${state.color.cube}" clip-path="url(#clip-${row}-${col})"/>\n`;
    }

    const safeChar = char
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    svgContent += `<g clip-path="url(#clip-${row}-${col})">\n`;
    svgContent += `  <g transform="translate(${cx}, ${cy}) matrix(${ux}, ${uy}, ${vx}, ${vy}, 0, 0)">\n`;
    svgContent += `    <text x="${dx}" y="${baselineY}" text-anchor="middle" font-family="${fontConfig.family}" font-weight="${fontConfig.weight}" font-size="${fontConfig.size}" fill="${state.color.text}">${safeChar}</text>\n`;
    svgContent += `  </g>\n`;
    svgContent += `</g>\n`;
  });

  svgContent += `</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  downloadBlob(blob, `${getExportPrefix()}-${face}.svg`);
}

// ----------------------------------------------------------------
// [이미지 일괄 내보내기]
// ----------------------------------------------------------------
async function exportBatch() {
  const target = getCardGroupValue("exportTarget");
  const bgVal = getCardGroupValue("exportBg");
  const format = getCardGroupValue("exportFormat");

  const isObject = target === "object";
  const isTransparent = bgVal === "transparent";

  exportBtn.disabled = true;
  exportBtn.textContent = "EXPORTING...";

  try {
    if (isObject) {
      const size = getExportSize();
      exportObjectPNG(size, isTransparent);
    } else {
      const selectedFaces = Array.from(state.export.selectedFaces);

      if (selectedFaces.length === 0) {
        alert("최소 1개 이상의 면을 선택해주세요.");
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
    alert("내보내기 중 오류가 발생했습니다.");
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "EXPORT IMAGE";
  }
}

// ----------------------------------------------------------------
// 14-5. 비디오 녹화 모달 및 진행률 헬퍼
// ----------------------------------------------------------------
let activeRecordingSession = null;

function setRecordProgress(percent, label = "") {
  if (!recordModal) return;

  if (percent === null) {
    recordModal.hidden = true;
  } else {
    recordModal.hidden = false;
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    if (recordProgressFill) recordProgressFill.style.width = `${clamped}%`;
    if (recordProgressLabel) {
      recordProgressLabel.textContent = label || `녹화 진행 중... ${clamped}%`;
    }
  }
}

// 브라우저에서 사용 가능한 비디오 MIME 타입 탐색
function getOptimalVideoMime(preferredFormat) {
  if (preferredFormat === "mp4") {
    const mp4Mimes = [
      'video/mp4;codecs="avc1.42001e"',
      "video/mp4;codecs=avc1",
      "video/mp4",
    ];
    for (const mime of mp4Mimes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext: "mp4" };
      }
    }
  }

  const webmMimes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mime of webmMimes) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return { mime, ext: "webm" };
    }
  }

  return { mime: "", ext: preferredFormat === "mp4" ? "mp4" : "webm" };
}

// ----------------------------------------------------------------
// 14-6. 3D 오브젝트 셔플 비디오 녹화
// ----------------------------------------------------------------
async function setupObjectVideoRecording(preferredFormat = "mp4") {
  const savedW = stage.clientWidth;
  const savedH = stage.clientHeight;
  const savedAspect = camera.aspect;
  const savedClearColor = renderer.getClearColor(new THREE.Color());
  const savedClearAlpha = renderer.getClearAlpha();
  const savedThickness = outlinePass.edgeThickness;
  const savedStrength = outlinePass.edgeStrength;

  const bgColor = getCurrentBackgroundColor();
  renderer.setClearColor(bgColor, 1);

  const exportOutlineColor = getExportOutlineColor(bgColor);
  outlinePass.visibleEdgeColor.set(exportOutlineColor);
  outlinePass.hiddenEdgeColor.set(exportOutlineColor);

  const videoScale = Math.max(1, VIDEO_OBJECT_SIZE / 720);
  outlinePass.edgeThickness = Math.max(2, Math.round(OUTLINE_EDGE_THICKNESS * videoScale));
  outlinePass.edgeStrength = Math.max(6, Math.round(OUTLINE_EDGE_STRENGTH * 1.5));
  outlinePass.enabled = true;

  if (outlinePass.overlayMaterial) {
    outlinePass.overlayMaterial.blending = THREE.CustomBlending;
    outlinePass.overlayMaterial.blendSrc = THREE.SrcAlphaFactor;
    outlinePass.overlayMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
    outlinePass.overlayMaterial.blendEquation = THREE.AddEquation;
  }

  const videoSize = VIDEO_OBJECT_SIZE;
  applyRendererSize(videoSize, videoSize);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  composer.render();

  const restoreRenderer = () => {
    applyRendererSize(savedW, savedH);
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();
    outlinePass.visibleEdgeColor.set(state.color.outline);
    outlinePass.hiddenEdgeColor.set(state.color.outline);
    outlinePass.edgeThickness = savedThickness;
    outlinePass.edgeStrength = savedStrength;
    renderer.setClearColor(savedClearColor, savedClearAlpha);
    composer.render();
  };

  const stream = canvas.captureStream(60);
  const { mime, ext } = getOptimalVideoMime(preferredFormat);
  const recorderOptions = mime ? { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE } : { videoBitsPerSecond: VIDEO_BITRATE };

  const mediaRecorder = new MediaRecorder(stream, recorderOptions);
  const chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let stopResolver = null;
  const stopPromise = new Promise((res) => {
    stopResolver = res;
  });

  mediaRecorder.onstop = () => {
    try {
      if (chunks.length > 0) {
        const finalBlobType = mime || (ext === "mp4" ? "video/mp4" : "video/webm");
        const blob = new Blob(chunks, { type: finalBlobType });
        downloadBlob(blob, `${getExportPrefix()}-shuffle-object.${ext}`);
      } else {
        console.warn("녹화 청크가 비어 있습니다.");
      }
    } finally {
      restoreRenderer();
      stopResolver?.();
    }
  };

  mediaRecorder.start(100);

  return {
    stop: async () => {
      if (mediaRecorder.state === "recording") {
        try {
          mediaRecorder.requestData();
        } catch (e) {}
        mediaRecorder.stop();
        await Promise.race([stopPromise, new Promise((r) => setTimeout(r, 1200))]);
      } else {
        restoreRenderer();
      }
    },
  };
}

// ----------------------------------------------------------------
// 14-7. 2D 선택된 면별 개별 독립 비디오 녹화 및 개별 다운로드
// ----------------------------------------------------------------
async function setupFacesVideoRecording(preferredFormat = "mp4") {
  const selectedFaces = Array.from(state.export.selectedFaces);
  if (selectedFaces.length === 0) {
    alert("최소 1개 이상의 면을 선택해주세요.");
    return null;
  }

  const { mime, ext } = getOptimalVideoMime(preferredFormat);
  const recorderOptions = mime ? { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE } : { videoBitsPerSecond: VIDEO_BITRATE };
  const size = VIDEO_FACE_SIZE;

  // 선택된 각 면마다 1:1 전용 고화질 캔버스와 MediaRecorder 생성
  const faceRecorders = selectedFaces.map((face) => {
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = size;
    faceCanvas.height = size;
    const ctx = faceCanvas.getContext("2d");

    const stream = faceCanvas.captureStream(60);
    const mediaRecorder = new MediaRecorder(stream, recorderOptions);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    let stopResolver = null;
    const stopPromise = new Promise((res) => {
      stopResolver = res;
    });

    mediaRecorder.onstop = () => {
      stopResolver?.({ face, chunks });
    };

    return {
      face,
      canvas: faceCanvas,
      ctx,
      recorder: mediaRecorder,
      chunks,
      stopPromise,
    };
  });

  // 매 프레임마다 선택된 면들의 3x3 타일을 각각의 캔버스에 실시간 렌더링
  let renderLoopId = null;
  function renderAllSelectedFaces() {
    const tile = size / 3;

    faceRecorders.forEach(({ face, canvas: fCanvas, ctx }) => {
      ctx.fillStyle = state.color.cube;
      ctx.fillRect(0, 0, fCanvas.width, fCanvas.height);

      const tiles = getVisibleTilesForFace(face);
      tiles.forEach(({ image, col, row, ux, uy, vx, vy }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(col * tile, row * tile, tile, tile);
        ctx.clip();
        ctx.translate((col + 0.5) * tile, (row + 0.5) * tile);
        ctx.transform(ux, uy, vx, vy, 0, 0);
        ctx.drawImage(image, -tile / 2, -tile / 2, tile, tile);
        ctx.restore();
      });
    });

    renderLoopId = requestAnimationFrame(renderAllSelectedFaces);
  }

  // 첫 프레임 즉시 렌더링 후 루프 시작
  renderAllSelectedFaces();

  // 모든 선택된 면의 레코더 일괄 시작
  faceRecorders.forEach(({ recorder }) => recorder.start(100));

  return {
    stop: async () => {
      // 1) 레코더 정지 및 데이터 수집
      const stopPromises = faceRecorders.map(async ({ recorder, stopPromise }) => {
        if (recorder.state === "recording") {
          try {
            recorder.requestData();
          } catch (e) {}
          recorder.stop();
          return await Promise.race([stopPromise, new Promise((r) => setTimeout(r, 1200))]);
        }
        return null;
      });

      const results = await Promise.all(stopPromises);
      if (renderLoopId) cancelAnimationFrame(renderLoopId);

      // 2) 각 선택된 면별로 개별 비디오 파일 순차 다운로드
      const finalBlobType = mime || (ext === "mp4" ? "video/mp4" : "video/webm");
      const prefix = getExportPrefix();

      for (const result of results) {
        if (result && result.chunks.length > 0) {
          const blob = new Blob(result.chunks, { type: finalBlobType });
          downloadBlob(blob, `${prefix}-shuffle-${result.face}.${ext}`);
          // 브라우저 팝업 차단 방지용 미세 딜레이
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    },
  };
}

// ----------------------------------------------------------------
// [비디오 녹화 시작 핸들러 (시작/종료 딜레이 및 전 과정 완벽 준수)]
// ----------------------------------------------------------------
recordBtn?.addEventListener("click", async () => {
  if (activeRecordingSession || state.interaction.turning) return;

  const target = getCardGroupValue("exportTarget");
  const isObject = target === "object";
  const preferredFormat = getCardGroupValue("recordVideoFormat") || "mp4";
  const recordAction = getCardGroupValue("recordAction") || "shuffle";
  const isSolve = recordAction === "solve";
  const actionLabel = isSolve ? "맞추기(Solve)" : "셔플(Shuffle)";

  if (isSolve && state.history.undoStack.length === 0) {
    alert("큐브가 이미 완성 상태입니다. 먼저 큐브를 섞거나 회전한 후 녹화해주세요.");
    return;
  }

  // 녹화 중 UI 및 단축키 비활성화
  recordBtn.disabled = true;
  exportBtn.disabled = true;

  try {
    // 1단계: 레코더 세션 초기화 및 녹화 시작
    setRecordProgress(5, `녹화 시작 (${actionLabel} 전 정지 상태 캡처 중)...`);

    if (isObject) {
      activeRecordingSession = await setupObjectVideoRecording(preferredFormat);
    } else {
      activeRecordingSession = await setupFacesVideoRecording(preferredFormat);
    }

    if (!activeRecordingSession) {
      setRecordProgress(null);
      recordBtn.disabled = false;
      exportBtn.disabled = false;
      return;
    }

    // 2단계: 녹화 시작 전 딜레이(RECORD_START_DELAY: 800ms) 완벽 대기
    await new Promise((resolve) => setTimeout(resolve, RECORD_START_DELAY));

    // 3단계: 셔플 또는 솔브 모션 시퀀스를 순차적으로 100% 실행
    const runMotion = isSolve ? solveCube : shuffleCube;
    await new Promise((resolve) => {
      runMotion(
        () => {
          // 모든 회전 애니메이션이 100% 완료되었을 때 호출
          resolve();
        },
        (currentStep, totalSteps) => {
          // 각 회전 스텝별 진행률을 실시간 모달에 1:1 반영
          const percent = 10 + Math.round((currentStep / totalSteps) * 80);
          setRecordProgress(
            percent,
            `${actionLabel} 녹화 진행 중 (${currentStep} / ${totalSteps})...`,
          );
        },
      );
    });

    // 4단계: 모든 회전 완료 후 최종 딜레이(RECORD_END_DELAY: 1000ms) 완벽 대기
    setRecordProgress(95, `${actionLabel} 완료 (완료 후 정지 상태 캡처 중)...`);
    await new Promise((resolve) => setTimeout(resolve, RECORD_END_DELAY));

    // 5단계: 녹화 세션 안전 마감 및 개별 비디오 파일 다운로드
    setRecordProgress(100, "비디오 인코딩 및 개별 파일 다운로드 중...");
    if (activeRecordingSession) {
      await activeRecordingSession.stop();
    }
  } catch (err) {
    console.error("녹화 실행 오류:", err);
    alert("녹화 처리 중 문제가 발생했습니다.");
  } finally {
    // 6단계: 상태 원상 복구 및 모달 닫기
    activeRecordingSession = null;
    setRecordProgress(null);
    recordBtn.disabled = false;
    exportBtn.disabled = false;
  }
});

exportBtn?.addEventListener("click", exportBatch);

/* ================================================================
   15. UI EVENT LISTENERS (UI 이벤트 리스너 연결)
   ================================================================ */

document
  .querySelectorAll("input[type='text'], input[data-face]")
  .forEach((input) => {
    input.addEventListener("pointerdown", () => {
      requestAnimationFrame(() => input.select());
    });
  });

unifiedWordInput?.addEventListener("input", (e) => {
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

    if (unifiedWordInput) {
      unifiedWordInput.value = faceInputs
        .map((i) => i.value || " ")
        .join("")
        .trimEnd();
    }
  });
});

turnButtons.forEach((button) => {
  button.addEventListener("click", () => {
    turn(button.dataset.turn, Number(button.dataset.dir));
  });
});

shuffleButton?.addEventListener("click", () => {
  shuffleCube();
});

solveBtn?.addEventListener("click", () => {
  solveCube();
});

undoBtn?.addEventListener("click", undo);
redoBtn?.addEventListener("click", redo);
resetCubeBtn?.addEventListener("click", resetCube);
resetViewBtn?.addEventListener("click", resetView);

function initFontSelector() {
  if (!fontSelect) return;
  fontSelect.innerHTML = "";
  FONT_REGISTRY.forEach((font) => {
    const opt = document.createElement("option");
    opt.value = font.id;
    opt.textContent = font.name;
    if (font.id === state.typography.currentFontId) opt.selected = true;
    fontSelect.appendChild(opt);
  });

  fontSelect.addEventListener("change", (e) => {
    setCubeFont(e.target.value);
  });
}

initFontSelector();

document.fonts.ready.then(() => {
  updateAllTextures();
  updateFacePreviews();
});

/* ================================================================
   16. RENDER LOOP & INITIALIZATION (렌더 루프 및 실행 시작)
   ================================================================ */

createCube();
updateAllTextures();
rotateRig();
updateHistoryButtons();

function animate() {
  if (!state.interaction.dragging && autoRotateToggle.checked) {
    state.view.targetYaw += AUTO_ROTATE_SPEED;
  }
  state.view.yaw = THREE.MathUtils.damp(state.view.yaw, state.view.targetYaw, ROTATION_DAMPING, 1 / 60);
  state.view.pitch = THREE.MathUtils.damp(state.view.pitch, state.view.targetPitch, ROTATION_DAMPING, 1 / 60);
  rotateRig();

  composer.render();
  requestAnimationFrame(animate);
}

animate();
