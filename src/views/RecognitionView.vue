<template>
  <div class="bg-black w-screen h-screen overflow-hidden fixed inset-0">
    <!-- WebGL Canvas Background -->
    <canvas ref="webglCanvasRef" class="absolute inset-0 w-full h-full opacity-30"></canvas>

    <!-- Original Detection Content -->
    <div class="relative z-10 w-full h-full flex justify-center items-center">
      <span class="text-red-500 text-4xl">{{ message }}</span>
    </div>

    <!-- Performance Stats -->
    <div class="absolute top-4 left-4 text-white bg-black/50 p-4 rounded-lg z-20">
      <div class="text-sm space-y-1">
        <div>FPS: {{ fps.toFixed(1) }}</div>
        <div>Particles: {{ particleCount.toLocaleString() }}</div>
        <div>Render Time: {{ renderTime.toFixed(2) }}ms</div>
        <div>Memory: {{ memoryUsage.toFixed(1) }}MB</div>
      </div>
    </div>

    <!-- Controls -->
    <div class="absolute top-4 right-4 text-white bg-black/50 p-4 rounded-lg z-20">
      <div class="space-y-3">
        <div>
          <label class="text-sm block mb-1">Particle Count</label>
          <input
            v-model.number="particleCount"
            type="range"
            min="1000"
            max="100000"
            step="1000"
            class="w-32"
          />
        </div>
        <div>
          <label class="text-sm block mb-1">Speed</label>
          <input v-model.number="speed" type="range" min="0.1" max="5" step="0.1" class="w-32" />
        </div>
        <button
          @click="toggleWebGLAnimation"
          class="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm"
        >
          {{ isWebGLAnimating ? 'Pause WebGL' : 'Start WebGL' }}
        </button>
        <button
          @click="resetParticles"
          class="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm ml-2"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Status -->
    <div class="absolute bottom-4 left-4 text-white bg-black/50 p-2 rounded z-20">
      <span class="text-sm"
        >Detection: {{ message }} | WebGL: {{ isWebGLAnimating ? 'Running' : 'Paused' }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import useDetection from '@/hooks/detection'
// 类型导入已移除，因为不再使用这些类型

// Original Detection Functionality
const { start, stop, renderVideo, onActive, onInactive, onInit } = useDetection({
  showVideo: {
    enable: true,
    width: 200,
    height: 200,
    x: 100,
    y: 100,
  },
})
const message = ref('离开')

onActive(() => {
  message.value = '进入'
})
onInactive(() => {
  message.value = '离开'
})
onInit(() => {
  // Original initialization logic
})

// WebGL Canvas and Context
const webglCanvasRef = ref<HTMLCanvasElement>()
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffer: WebGLBuffer | null = null

// WebGL Animation state
const isWebGLAnimating = ref(true)
const fps = ref(0)
const renderTime = ref(0)
const memoryUsage = ref(0)
const particleCount = ref(10000)
const speed = ref(1.0)

// Performance tracking
let frameCount = 0
let lastFpsTime = 0

// Particle data
let particles: Float32Array
let time = 0

// Vertex shader
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec3 a_color;
  attribute float a_size;
  attribute float a_life;
  
  uniform float u_time;
  uniform float u_speed;
  
  varying vec3 v_color;
  varying float v_life;
  
  void main() {
    vec2 position = a_position;
    position.x += sin(u_time * u_speed + a_life) * 0.1;
    position.y += cos(u_time * u_speed + a_life) * 0.1;
    
    gl_Position = vec4(position, 0.0, 1.0);
    gl_PointSize = a_size * (1.0 - a_life);
    
    v_color = a_color;
    v_life = a_life;
  }
`

// Fragment shader
const fragmentShaderSource = `
  precision mediump float;
  
  varying vec3 v_color;
  varying float v_life;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    if (dist > 0.5) {
      discard;
    }
    
    float alpha = 1.0 - dist * 2.0;
    alpha *= (1.0 - v_life);
    
    gl_FragColor = vec4(v_color, alpha);
  }
`

// Initialize WebGL
function initWebGL() {
  if (!webglCanvasRef.value) return false

  const canvas = webglCanvasRef.value
  canvas.width = window.innerWidth * window.devicePixelRatio
  canvas.height = window.innerHeight * window.devicePixelRatio

  gl = (canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext
  if (!gl) {
    console.error('WebGL not supported')
    return false
  }

  // Create shaders
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)

  if (!vertexShader || !fragmentShader) return false

  // Create program
  program = gl.createProgram()
  if (!program) return false

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return false
  }

  gl.useProgram(program)

  // Create buffer
  buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

  // Set up attributes
  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const colorLocation = gl.getAttribLocation(program, 'a_color')
  const sizeLocation = gl.getAttribLocation(program, 'a_size')
  const lifeLocation = gl.getAttribLocation(program, 'a_life')

  gl.enableVertexAttribArray(positionLocation)
  gl.enableVertexAttribArray(colorLocation)
  gl.enableVertexAttribArray(sizeLocation)
  gl.enableVertexAttribArray(lifeLocation)

  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 32, 0)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 32, 8)
  gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 32, 20)
  gl.vertexAttribPointer(lifeLocation, 1, gl.FLOAT, false, 32, 24)

  // Set up uniforms
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const speedLocation = gl.getUniformLocation(program, 'u_speed')

  gl.uniform1f(timeLocation, 0)
  gl.uniform1f(speedLocation, speed.value)

  // Enable blending
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  return true
}

// Create shader
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

// Initialize particles
function initParticles() {
  particles = new Float32Array(particleCount.value * 8) // position(2) + color(3) + size(1) + life(1)

  for (let i = 0; i < particleCount.value; i++) {
    const index = i * 8

    // Position (random in screen space)
    particles[index] = (Math.random() - 0.5) * 2
    particles[index + 1] = (Math.random() - 0.5) * 2

    // Color (random)
    particles[index + 2] = Math.random()
    particles[index + 3] = Math.random()
    particles[index + 4] = Math.random()

    // Size
    particles[index + 5] = Math.random() * 10 + 5

    // Life (random phase)
    particles[index + 6] = Math.random()
  }

  if (gl && buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, particles, gl.DYNAMIC_DRAW)
  }
}

// Update particles
function updateParticles() {
  for (let i = 0; i < particleCount.value; i++) {
    const index = i * 8 + 6 // life offset
    particles[index] += 0.01 * speed.value

    if (particles[index] > 1.0) {
      particles[index] = 0.0
    }
  }

  if (gl && buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, particles)
  }
}

// Render WebGL frame
function renderWebGL() {
  if (!gl || !program) return

  const startTime = performance.now()

  // Clear
  gl.clearColor(0, 0, 0, 0.3) // Semi-transparent background
  gl.clear(gl.COLOR_BUFFER_BIT)

  // Update uniforms
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const speedLocation = gl.getUniformLocation(program, 'u_speed')

  gl.uniform1f(timeLocation, time)
  gl.uniform1f(speedLocation, speed.value)

  // Draw particles
  gl.drawArrays(gl.POINTS, 0, particleCount.value)

  // Update time
  time += 0.016

  // Performance tracking
  const currentTime = performance.now()
  frameCount++

  if (currentTime - lastFpsTime >= 1000) {
    fps.value = (frameCount * 1000) / (currentTime - lastFpsTime)
    frameCount = 0
    lastFpsTime = currentTime
  }

  renderTime.value = currentTime - startTime

  // Memory usage estimation
  memoryUsage.value =
    particles.byteLength / 1024 / 1024 + (gl.canvas.width * gl.canvas.height * 4) / 1024 / 1024
}

// WebGL Animation loop
let webglAnimationId: number

function animateWebGL() {
  if (isWebGLAnimating.value) {
    updateParticles()
    renderWebGL()
  }
  webglAnimationId = requestAnimationFrame(animateWebGL)
}

// WebGL Event handlers
function toggleWebGLAnimation() {
  isWebGLAnimating.value = !isWebGLAnimating.value
}

function resetParticles() {
  initParticles()
  time = 0
}

watch(particleCount, () => {
  initParticles()
})

// Lifecycle
onMounted(async () => {
  // Start original detection
  await start()
  renderVideo()

  // Initialize WebGL
  if (initWebGL()) {
    initParticles()
    animateWebGL()
  }

  // Handle resize
  const handleResize = () => {
    if (webglCanvasRef.value && gl) {
      webglCanvasRef.value.width = window.innerWidth * window.devicePixelRatio
      webglCanvasRef.value.height = window.innerHeight * window.devicePixelRatio
      gl.viewport(0, 0, webglCanvasRef.value.width, webglCanvasRef.value.height)
    }
  }

  window.addEventListener('resize', handleResize)

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })
})

onUnmounted(() => {
  // Stop original detection
  stop()

  // Stop WebGL animation
  if (webglAnimationId) {
    cancelAnimationFrame(webglAnimationId)
  }
})
</script>
