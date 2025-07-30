// main.js
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// 디자인 기준 해상도
const DESIGN_WIDTH  = 2560;
const DESIGN_HEIGHT = 1440;

const container = document.getElementById("container");
const bgCanvas  = document.getElementById("bg-canvas");
const person    = document.getElementById("person");

let currentIndex = 1;
const maxIndex   = 8;
let currentScale = 1;
let poster       = { x:0, y:0, width:0, height:0 };

// 1) container를 화면 중앙에 scale & position
function updateScale() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // 화면 대비 디자인 해상도 비율
  currentScale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
  // CSS scale
  container.style.transform = `scale(${currentScale})`;
  // 스케일된 크기
  const sw = DESIGN_WIDTH  * currentScale;
  const sh = DESIGN_HEIGHT * currentScale;
  // 화면 정중앙에 배치
  container.style.left = `${(w - sw) / 2}px`;
  container.style.top  = `${(h - sh) / 2}px`;
}

// 2) 배경 크기·위치 계산 (디자인 좌표계 중앙)
function updatePosterSize() {
  const sf = 0.6;
  const w  = DESIGN_WIDTH  * sf;
  const h  = w * (297 / 420);
  const x  = (DESIGN_WIDTH  - w) / 2;
  const y  = (DESIGN_HEIGHT - h) / 2;
  poster = { x, y, width: w, height: h };
}

// 3) 사람 크기·위치 설정 (poster 중앙)
function positionPerson() {
  // 사람 너비 = poster.width * 0.3
  const pw = poster.width * 0.3;
  person.style.width = `${pw}px`;
  // 높이는 auto 적용 후 offsetHeight로
  const ph = person.offsetHeight;

  // 중앙 위치(px)
  const left = poster.x + (poster.width  - pw) / 2;
  const top  = poster.y + (poster.height - ph) / 2;
  person.style.left = `${left}px`;
  person.style.top  = `${top}px`;

  // 애니메이션·그림자용 초기값 저장
  person.initLeft = left;
  person.initTop  = top;
}

// 4) 리사이즈/DPR 변경 시 재계산
function onResizeOrDPR() {
  updateScale();
  updatePosterSize();
  positionPerson();
  loadCompositeTexture(currentIndex);
  // Three.js 쉐이더 해상도(uniform) 그대로 디자인 해상도 사용
  uniforms.uResolution.value.set(DESIGN_WIDTH, DESIGN_HEIGHT);
}
window.addEventListener("resize", onResizeOrDPR);
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener("change", onResizeOrDPR);

// 5) 사람 위아래 애니메이션
let dir = 1, dy = 0;
function animatePerson() {
  dy += dir * 0.15;
  if (dy > 20 || dy < 0) dir *= -1;
  person.style.top = `${person.initTop + dy}px`;
  requestAnimationFrame(animatePerson);
}

// ── Three.js + 2D 캔버스 초기화 ──
updateScale();
updatePosterSize();
positionPerson();
animatePerson();

const scene    = new THREE.Scene();
const camera   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const renderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true });
// 픽셀 비율 1로 고정 (CSS scale로 전체 크기 조정)
renderer.setPixelRatio(1);
renderer.setSize(DESIGN_WIDTH, DESIGN_HEIGHT);

// 오프스크린 2D 캔버스
const canvas2d = document.createElement("canvas");
canvas2d.width  = DESIGN_WIDTH;
canvas2d.height = DESIGN_HEIGHT;
const ctx = canvas2d.getContext("2d");

// 리플 쉐이더 셋업
const geometry      = new THREE.PlaneGeometry(2, 2);
const maxRipples    = 20;
const rippleHistory = [];
const uniforms = {
  uTexture:    { value: null },
  uTime:       { value: 0.0 },
  uResolution: { value: new THREE.Vector2(DESIGN_WIDTH, DESIGN_HEIGHT) },
  uRipples:    { value: Array.from({ length: maxRipples },
                     () => new THREE.Vector3(-1, -1, 0)) },
  uRippleCount:{ value: 0 }
};
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture;
    uniform vec3 uRipples[20];
    uniform int uRippleCount;
    uniform float uTime;
    uniform vec2 uResolution;
    const float radius = 0.15;

    vec2 ripple(vec2 uv, vec2 center, float age) {
      vec2 diff = (uv - center) * vec2(uResolution.x/uResolution.y, 1.0);
      float dist = length(diff);
      float fade = clamp(1.0 - age/12.0, 0.0, 1.0);
      float mask = pow(1.0 - smoothstep(radius*0.5, radius, dist), 2.0);
      float wave = 0.1 * sin(30.0*dist - age*3.0) / (1.0 + 80.0*dist);
      return normalize(diff) * wave * mask * fade;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec2 totalOffset = vec2(0.0);
      for (int i = 0; i < 20; i++) {
        if (i >= uRippleCount) break;
        vec3 d = uRipples[i];
        float age = uTime - d.z;
        if (age > 8.0) continue;
        totalOffset += ripple(uv, d.xy, age);
      }
      gl_FragColor = texture2D(uTexture, uv + totalOffset);
    }
  `
});
scene.add(new THREE.Mesh(geometry, material));

// 6) 배경+그림자 합성 텍스처 로드
function loadCompositeTexture(idx) {
  const bgImg     = new Image();
  const shadowImg = new Image();
  let loaded = 0;

  bgImg.onload = shadowImg.onload = () => {
    if (++loaded !== 2) return;

    // 배경: 중앙
    ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.drawImage(bgImg, poster.x, poster.y, poster.width, poster.height);

    // 그림자: 사람보다 왼쪽 50px, 아래 100px
    const sw = person.offsetWidth;
    const sh = sw / (shadowImg.width / shadowImg.height);
    const sx = person.initLeft - 50;
    const sy = person.initTop  + 100;
    ctx.drawImage(shadowImg, sx, sy, sw, sh);

    uniforms.uTexture.value = new THREE.CanvasTexture(canvas2d);
  };

  bgImg.src     = `./assets/bg${idx}.png`;
  shadowImg.src = `./assets/shadow${idx}.png`;
}
loadCompositeTexture(currentIndex);

// 7) 사람 클릭 시 이미지 순환
person.addEventListener("click", () => {
  currentIndex = (currentIndex % maxIndex) + 1;
  person.src   = `./assets/person${currentIndex}.png`;
  loadCompositeTexture(currentIndex);
});

// 8) 포인터 이동 → 리플
window.addEventListener("pointermove", (e) => {
  const rect = container.getBoundingClientRect();
  const dx   = (e.clientX - rect.left) / currentScale;
  const dy   = (e.clientY - rect.top)  / currentScale;
  const nx   = dx / DESIGN_WIDTH;
  const ny   = 1 - dy / DESIGN_HEIGHT;
  const t    = performance.now() * 0.001;

  rippleHistory.push(new THREE.Vector3(nx, ny, t));
  if (rippleHistory.length > maxRipples) rippleHistory.shift();
  rippleHistory.forEach((v,i) => uniforms.uRipples.value[i] = v);
  uniforms.uRippleCount.value = rippleHistory.length;
});

// 9) 렌더 루프
function render(time) {
  uniforms.uTime.value = time * 0.001;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
