import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const bgCanvas = document.getElementById("bg-canvas");
const person = document.getElementById("person");

let currentIndex = 1;
const maxIndex = 8;
let poster = { x: 0, y: 0, width: 0, height: 0 };

function updatePosterSize() {
  const scale = 0.6;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const posterWidth = screenWidth * scale;
  const posterHeight = posterWidth * (297 / 420);
  const x = (screenWidth - posterWidth) / 2;
  const y = (screenHeight - posterHeight) / 2;
  poster = { x, y, width: posterWidth, height: posterHeight };
}
updatePosterSize();

const baseBottom = 0;
let direction = 1;
let position = 0;
function animatePerson() {
  position += direction * 0.15;
  if (position >= 20 || position <= 0) direction *= -1;
  person.style.bottom = `${baseBottom + position}px`;
  requestAnimationFrame(animatePerson);
}
animatePerson();
console.log("Current bottom:", baseBottom + position);


const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const geometry = new THREE.PlaneGeometry(2, 2);
const maxRipples = 20;
const rippleHistory = [];

const uniforms = {
  uTexture: { value: null },
  uTime: { value: 0.0 },
  uResolution: {
    value: new THREE.Vector2(window.innerWidth, window.innerHeight),
  },
  uRipples: {
    value: Array.from({ length: maxRipples }, () => new THREE.Vector3(-1, -1, 0)),
  },
  uRippleCount: { value: 0 },
};

const rippleEffectMaterial = new THREE.ShaderMaterial({
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
      vec2 diff = (uv - center) * vec2(uResolution.x / uResolution.y, 1.0);
      float dist = length(diff);

      float fade = clamp(1.0 - age / 12.0, 0.0, 1.0);
      float mask = pow(1.0 - smoothstep(radius * 0.5, radius, dist), 2.0);
      float wave = 0.1 * sin(30.0 * dist - age * 3.0) / (1.0 + 80.0 * dist);

      return normalize(diff) * wave * mask * fade;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      vec2 totalOffset = vec2(0.0);

      for (int i = 0; i < 20; i++) {
        if (i >= uRippleCount) break;
        vec3 rippleData = uRipples[i];
        float age = uTime - rippleData.z;
        if (age > 8.0) continue;
        totalOffset += ripple(uv, rippleData.xy, age);
      }

      gl_FragColor = texture2D(uTexture, uv + totalOffset);
    }
  `,
});

const mesh = new THREE.Mesh(geometry, rippleEffectMaterial);
scene.add(mesh);

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function loadCompositeTexture(index) {
  const bgPath = `./assets/bg${index}.png`;
  const shadowPath = `./assets/shadow${index}.png`;
  const bgImg = new Image();
  const shadowImg = new Image();
  let loaded = 0;

  bgImg.onload = shadowImg.onload = () => {
    if (++loaded === 2) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bgImg, poster.x, poster.y, poster.width, poster.height);

      // ⬇️ 사람 기준으로 그림자 위치 계산
      const personRect = person.getBoundingClientRect();
      const canvasRect = bgCanvas.getBoundingClientRect();

      const personCenterX = personRect.left + personRect.width / 2 - canvasRect.left;
      const personBottomY = canvasRect.bottom - personRect.bottom;

      const aspect = shadowImg.width / shadowImg.height;
      const shadowW = personRect.width;
      const shadowH = shadowW / aspect;

            // ✅ 상대 비율로 오프셋 계산 (예: 사람 너비의 20%, 높이의 50%)
      const offsetX = shadowW * 0.2; // 너비의 20%만큼 왼쪽
      const offsetY = shadowH * 0.75; // 높이의 30%만큼 아래

      const shadowX = personCenterX - shadowW / 2 - offsetX;
      const shadowY = personBottomY - offsetY;

      ctx.drawImage(shadowImg, shadowX, shadowY, shadowW, shadowH);

      const texture = new THREE.CanvasTexture(canvas);
      rippleEffectMaterial.uniforms.uTexture.value = texture;
    }
  };

  bgImg.src = bgPath;
  shadowImg.src = shadowPath;
}

loadCompositeTexture(currentIndex);

person.addEventListener("click", () => {
  currentIndex = (currentIndex % maxIndex) + 1;
  person.src = `./assets/person${currentIndex}.png`;
  loadCompositeTexture(currentIndex);
});

window.addEventListener("pointermove", (e) => {
  const now = performance.now() * 0.001;
  rippleHistory.push(
    new THREE.Vector3(
      e.clientX / window.innerWidth,
      1 - e.clientY / window.innerHeight,
      now
    )
  );
  if (rippleHistory.length > maxRipples) rippleHistory.shift();
  for (let i = 0; i < maxRipples; i++) {
    uniforms.uRipples.value[i] = rippleHistory[i] || new THREE.Vector3(-1, -1, 0);
  }
  uniforms.uRippleCount.value = rippleHistory.length;
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  updatePosterSize();
  loadCompositeTexture(currentIndex);
  uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

function render(t) {
  uniforms.uTime.value = t * 0.001;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
