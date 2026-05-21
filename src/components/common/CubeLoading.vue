<template>
  <div class="cube-container">
    <div class="cube">
      <div class="face top"></div>
      <div class="face bottom"></div>
      <div class="face right"></div>
      <div class="face left"></div>
      <div class="face front"></div>
      <div class="face back"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 3D旋转立方体loading组件
</script>

<style scoped lang="css">
.cube-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.cube {
  width: 2rem;
  height: 2rem;
  position: relative;
  transform-style: preserve-3d;
  animation: spin 3s infinite cubic-bezier(0.16, 0.61, 0.49, 0.91);
}

.face {
  position: absolute;
  width: 100%;
  height: 100%;
  background: color-mix(in srgb, var(--primary-light) 70%, transparent);
  border: 2px solid color-mix(in srgb, #fff 80%, transparent);
  border-radius: 5px;
  box-shadow: 0 0 15px color-mix(in srgb, var(--primary-light) 40%, transparent);
}

.top {
  transform: rotateX(90deg) translateZ(2rem);
  animation: shift-top 3s infinite ease-out;
}

.bottom {
  transform: rotateX(-90deg) translateZ(2rem);
  animation: shift-bottom 3s infinite ease-out;
}

.right {
  transform: rotateY(90deg) translateZ(2rem);
  animation: shift-right 3s infinite ease-out;
}

.left {
  transform: rotateY(-90deg) translateZ(2rem);
  animation: shift-left 3s infinite ease-out;
}

.front {
  transform: translateZ(2rem);
  animation: shift-front 3s infinite ease-out;
}

.back {
  transform: rotateY(-180deg) translateZ(2rem);
  animation: shift-back 3s infinite ease-out;
}

@keyframes spin {
  33% {
    transform: rotateX(-36deg) rotateY(-405deg);
  }

  100% {
    transform: rotateX(-36deg) rotateY(-405deg);
  }
}

@keyframes shift-top {
  33% {
    transform: rotateX(90deg) translateZ(1rem);
  }

  50% {
    transform: rotateX(90deg) translateZ(2rem);
  }

  60% {
    transform: rotateX(90deg) translateZ(2rem);
  }

  75% {
    transform: rotateX(90deg) translateZ(1rem);
  }
}

@keyframes shift-bottom {
  33% {
    transform: rotateX(-90deg) translateZ(1rem);
  }

  50% {
    transform: rotateX(-90deg) translateZ(2rem);
  }

  60% {
    transform: rotateX(-90deg) translateZ(2rem);
  }

  75% {
    transform: rotateX(-90deg) translateZ(1rem);
  }
}

@keyframes shift-right {
  33% {
    transform: rotateY(90deg) translateZ(1rem);
  }

  50% {
    transform: rotateY(90deg) translateZ(2rem);
  }

  60% {
    transform: rotateY(90deg) translateZ(2rem);
  }

  75% {
    transform: rotateY(90deg) translateZ(1rem);
  }
}

@keyframes shift-left {
  33% {
    transform: rotateY(-90deg) translateZ(1rem);
  }

  50% {
    transform: rotateY(-90deg) translateZ(2rem);
  }

  60% {
    transform: rotateY(-90deg) translateZ(2rem);
  }

  75% {
    transform: rotateY(-90deg) translateZ(1rem);
  }
}

@keyframes shift-front {
  33% {
    transform: translateZ(1rem);
  }

  50% {
    transform: translateZ(2rem);
  }

  60% {
    transform: translateZ(2rem);
  }

  75% {
    transform: translateZ(1rem);
  }
}

@keyframes shift-back {
  33% {
    transform: rotateY(-180deg) translateZ(1rem);
  }

  50% {
    transform: rotateY(-180deg) translateZ(2rem);
  }

  60% {
    transform: rotateY(-180deg) translateZ(2rem);
  }

  75% {
    transform: rotateY(-180deg) translateZ(1rem);
  }
}
</style>

