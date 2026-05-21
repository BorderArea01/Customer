/**
 * 图像质量评估工具类
 * 用于检测图像模糊、遮挡、光照等质量问题
 */

export interface ImageQualityResult {
  overallScore: number; // 综合质量评分 (0-1)
  blurScore: number;    // 模糊评分 (0-1, 越高越清晰)
  occlusionScore: number; // 遮挡评分 (0-1, 越高越完整)
  lightingScore: number;  // 光照评分 (0-1, 越高越均匀)
  issues: string[];     // 质量问题列表
}

export interface FaceKeypoints {
  leftEye: { x: number; y: number } | null;
  rightEye: { x: number; y: number } | null;
  nose: { x: number; y: number } | null;
  leftMouth: { x: number; y: number } | null;
  rightMouth: { x: number; y: number } | null;
  chin: { x: number; y: number } | null;
  leftEar: { x: number; y: number } | null;
  rightEar: { x: number; y: number } | null;
}

export class ImageQualityAssessor {
  private static readonly BLUR_THRESHOLD = 100; // 拉普拉斯算子阈值
  private static readonly LIGHTING_VARIANCE_THRESHOLD = 0.3; // 光照方差阈值
  // private static readonly MIN_KEYPOINTS_COUNT = 4; // 最少关键点数量

  /**
   * 评估图像质量
   * @param imageData 图像数据 (ImageData 或 Canvas)
   * @param faceKeypoints 人脸关键点信息
   * @returns 质量评估结果
   */
  static async assessImageQuality(
    imageData: ImageData | HTMLCanvasElement,
    faceKeypoints?: FaceKeypoints
  ): Promise<ImageQualityResult> {
    const issues: string[] = [];
    
    // 获取图像数据
    const canvas = imageData instanceof HTMLCanvasElement ? imageData : this.createCanvasFromImageData(imageData);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        overallScore: 0,
        blurScore: 0,
        occlusionScore: 0,
        lightingScore: 0,
        issues: ['无法获取图像上下文']
      };
    }

    const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 1. 模糊检测
    const blurScore = this.detectBlur(imageDataObj);
    if (blurScore < 0.3) {
      issues.push('图像模糊');
    }

    // 2. 光照质量检测
    const lightingScore = this.assessLighting(imageDataObj);
    if (lightingScore < 0.4) {
      issues.push('光照不均匀或过暗');
    }

    // 3. 人脸遮挡检测
    let occlusionScore = 1.0;
    if (faceKeypoints) {
      occlusionScore = this.detectOcclusion(imageDataObj, faceKeypoints);
      if (occlusionScore < 0.6) {
        issues.push('人脸有遮挡');
      }
    }

    // 4. 计算综合评分
    const overallScore = (blurScore * 0.4 + lightingScore * 0.3 + occlusionScore * 0.3);

    return {
      overallScore: Math.max(0, Math.min(1, overallScore)),
      blurScore,
      occlusionScore,
      lightingScore,
      issues
    };
  }

  /**
   * 使用拉普拉斯算子检测图像模糊
   * @param imageData 图像数据
   * @returns 模糊评分 (0-1, 越高越清晰)
   */
  private static detectBlur(imageData: ImageData): number {
    const { data, width, height } = imageData;
    let laplacianSum = 0;
    let pixelCount = 0;

    // 拉普拉斯算子核
    const kernel = [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0]
    ];

    // 转换为灰度图并应用拉普拉斯算子
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let laplacian = 0;
        
        // 应用拉普拉斯核
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4;
            const gray = (data[pixelIndex] + data[pixelIndex + 1] + data[pixelIndex + 2]) / 3;
            laplacian += gray * kernel[ky + 1][kx + 1];
          }
        }
        
        laplacianSum += Math.abs(laplacian);
        pixelCount++;
      }
    }

    const variance = laplacianSum / pixelCount;
    
    // 将方差转换为0-1评分
    // 方差越高，图像越清晰
    return Math.min(1, variance / this.BLUR_THRESHOLD);
  }

  /**
   * 评估光照质量
   * @param imageData 图像数据
   * @returns 光照评分 (0-1, 越高越均匀)
   */
  private static assessLighting(imageData: ImageData): number {
    const { data } = imageData;
    let totalBrightness = 0;
    let pixelCount = 0;
    const brightnessValues: number[] = [];

    // 计算每个像素的亮度
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
      brightnessValues.push(brightness);
      pixelCount++;
    }

    const meanBrightness = totalBrightness / pixelCount;
    
    // 计算亮度方差
    let variance = 0;
    for (const brightness of brightnessValues) {
      variance += Math.pow(brightness - meanBrightness, 2);
    }
    variance /= pixelCount;
    
    // 计算变异系数 (标准差/均值)
    const coefficientOfVariation = Math.sqrt(variance) / meanBrightness;
    
    // 变异系数越小，光照越均匀
    // 同时考虑整体亮度是否合适 (避免过暗或过亮)
    const brightnessScore = Math.max(0, 1 - Math.abs(meanBrightness - 128) / 128);
    const uniformityScore = Math.max(0, 1 - coefficientOfVariation / this.LIGHTING_VARIANCE_THRESHOLD);
    
    return (brightnessScore * 0.6 + uniformityScore * 0.4);
  }

  /**
   * 检测人脸遮挡
   * @param imageData 图像数据
   * @param keypoints 人脸关键点
   * @returns 遮挡评分 (0-1, 越高越完整)
   */
  private static detectOcclusion(imageData: ImageData, keypoints: FaceKeypoints): number {
    const { width, height } = imageData;
    let occlusionScore = 1.0;
    let checkedRegions = 0;

    // 检查关键区域是否被遮挡
    const regions = [
      { name: '左眼', point: keypoints.leftEye },
      { name: '右眼', point: keypoints.rightEye },
      { name: '鼻子', point: keypoints.nose },
      { name: '左嘴角', point: keypoints.leftMouth },
      { name: '右嘴角', point: keypoints.rightMouth }
    ];

    for (const region of regions) {
      if (region.point) {
        const regionScore = this.checkRegionOcclusion(imageData, region.point, width, height);
        occlusionScore += regionScore;
        checkedRegions++;
      }
    }

    // 检查人脸轮廓完整性
    const contourScore = this.checkFaceContour(imageData, keypoints, width, height);
    occlusionScore += contourScore;
    checkedRegions++;

    return checkedRegions > 0 ? occlusionScore / checkedRegions : 0;
  }

  /**
   * 检查特定区域是否被遮挡
   * @param imageData 图像数据
   * @param point 检查点
   * @param width 图像宽度
   * @param height 图像高度
   * @returns 区域完整性评分
   */
  private static checkRegionOcclusion(
    imageData: ImageData,
    point: { x: number; y: number },
    width: number,
    height: number
  ): number {
    const { data } = imageData;
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    const radius = 10; // 检查半径

    let validPixels = 0;
    let totalPixels = 0;

    // 检查圆形区域内的像素
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const checkX = x + dx;
        const checkY = y + dy;
        
        if (checkX >= 0 && checkX < width && checkY >= 0 && checkY < height) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= radius) {
            const pixelIndex = (checkY * width + checkX) * 4;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];
            
            // 检查是否为肤色或接近肤色的像素
            if (this.isSkinColor(r, g, b)) {
              validPixels++;
            }
            totalPixels++;
          }
        }
      }
    }

    return totalPixels > 0 ? validPixels / totalPixels : 0;
  }

  /**
   * 检查人脸轮廓完整性
   * @param imageData 图像数据
   * @param keypoints 关键点
   * @param width 图像宽度
   * @param height 图像高度
   * @returns 轮廓完整性评分
   */
  private static checkFaceContour(
    imageData: ImageData,
    keypoints: FaceKeypoints,
    width: number,
    height: number
  ): number {
    // 简化的人脸轮廓检查
    // 检查关键点之间的连线区域
    let contourScore = 1.0;
    
    if (keypoints.leftEye && keypoints.rightEye && keypoints.nose) {
      // 检查眼部区域
      // const eyeDistance = Math.sqrt(
      //   Math.pow(keypoints.rightEye.x - keypoints.leftEye.x, 2) +
      //   Math.pow(keypoints.rightEye.y - keypoints.leftEye.y, 2)
      // );
      
      // 检查鼻子到眼部连线的区域
      const noseToEyeScore = this.checkLineRegion(imageData, keypoints.nose, keypoints.leftEye, width, height);
      contourScore = Math.min(contourScore, noseToEyeScore);
    }

    return contourScore;
  }

  /**
   * 检查两点连线区域的完整性
   */
  private static checkLineRegion(
    imageData: ImageData,
    point1: { x: number; y: number },
    point2: { x: number; y: number },
    width: number,
    height: number
  ): number {
    const { data } = imageData;
    const steps = 10;
    let validSteps = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.floor(point1.x + (point2.x - point1.x) * t);
      const y = Math.floor(point1.y + (point2.y - point1.y) * t);
      
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        
        if (this.isSkinColor(r, g, b)) {
          validSteps++;
        }
      }
    }

    return validSteps / (steps + 1);
  }

  /**
   * 判断是否为肤色
   * @param r 红色分量
   * @param g 绿色分量
   * @param b 蓝色分量
   * @returns 是否为肤色
   */
  private static isSkinColor(r: number, g: number, b: number): boolean {
    // 简化的肤色检测算法
    // 基于RGB和HSV的肤色范围判断
    
    // RGB肤色范围
    const rgbSkin = (r > 95 && g > 40 && b > 20) &&
                   (Math.max(r, g, b) - Math.min(r, g, b) > 15) &&
                   (Math.abs(r - g) > 15) &&
                   (r > g && r > b);

    // HSV肤色范围
    const { h, s, v } = this.rgbToHsv(r, g, b);
    const hsvSkin = (h >= 0 && h <= 50) && (s >= 0.23 && s <= 0.68) && (v >= 0.35 && v <= 1.0);

    return rgbSkin || hsvSkin;
  }

  /**
   * RGB转HSV
   */
  private static rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff) % 6;
      } else if (max === g) {
        h = (b - r) / diff + 2;
      } else {
        h = (r - g) / diff + 4;
      }
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : diff / max;
    const v = max;

    return { h, s, v };
  }

  /**
   * 从ImageData创建Canvas
   */
  private static createCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas;
  }

  /**
   * 从MediaPipe关键点提取标准格式
   * @param keypoints MediaPipe关键点数组
   * @returns 标准关键点格式
   */
  static extractFaceKeypoints(keypoints: any[]): FaceKeypoints {
    if (!keypoints || keypoints.length === 0) {
      return {
        leftEye: null,
        rightEye: null,
        nose: null,
        leftMouth: null,
        rightMouth: null,
        chin: null,
        leftEar: null,
        rightEar: null
      };
    }

    // MediaPipe Face Mesh关键点索引
    const INDICES = {
      LEFT_EYE: 33,      // 左眼内角
      RIGHT_EYE: 263,    // 右眼内角
      NOSE: 1,           // 鼻尖
      LEFT_MOUTH: 61,    // 左嘴角
      RIGHT_MOUTH: 291,  // 右嘴角
      CHIN: 152,         // 下巴
      LEFT_EAR: 234,     // 左耳
      RIGHT_EAR: 454     // 右耳
    };

    return {
      leftEye: keypoints[INDICES.LEFT_EYE] ? { x: keypoints[INDICES.LEFT_EYE].x, y: keypoints[INDICES.LEFT_EYE].y } : null,
      rightEye: keypoints[INDICES.RIGHT_EYE] ? { x: keypoints[INDICES.RIGHT_EYE].x, y: keypoints[INDICES.RIGHT_EYE].y } : null,
      nose: keypoints[INDICES.NOSE] ? { x: keypoints[INDICES.NOSE].x, y: keypoints[INDICES.NOSE].y } : null,
      leftMouth: keypoints[INDICES.LEFT_MOUTH] ? { x: keypoints[INDICES.LEFT_MOUTH].x, y: keypoints[INDICES.LEFT_MOUTH].y } : null,
      rightMouth: keypoints[INDICES.RIGHT_MOUTH] ? { x: keypoints[INDICES.RIGHT_MOUTH].x, y: keypoints[INDICES.RIGHT_MOUTH].y } : null,
      chin: keypoints[INDICES.CHIN] ? { x: keypoints[INDICES.CHIN].x, y: keypoints[INDICES.CHIN].y } : null,
      leftEar: keypoints[INDICES.LEFT_EAR] ? { x: keypoints[INDICES.LEFT_EAR].x, y: keypoints[INDICES.LEFT_EAR].y } : null,
      rightEar: keypoints[INDICES.RIGHT_EAR] ? { x: keypoints[INDICES.RIGHT_EAR].x, y: keypoints[INDICES.RIGHT_EAR].y } : null
    };
  }
}
