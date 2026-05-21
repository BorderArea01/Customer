import { WebPlugin } from '@capacitor/core';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

import type { LzwcDetectionPlugin, FaceDetectionResult, PersonDetectionResult } from './definitions';

export class LzwcDetectionWeb extends WebPlugin implements LzwcDetectionPlugin {
  private faceDetector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private bodySegmenter: bodySegmentation.BodySegmenter | null = null;
  private modelsLoaded = false;
  private canvasCache: HTMLCanvasElement = document.createElement('canvas');

  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }

  private getCanvasContext(width: number, height: number): CanvasRenderingContext2D | null {
    this.canvasCache.width = width;
    this.canvasCache.height = height;
    const ctx = this.canvasCache.getContext('2d');
    if (!ctx) {
      console.error('无法获取 canvas 2D 上下文');
      return null;
    }
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }

  async loadModels(): Promise<void> {
    if (this.modelsLoaded) return;

    try {
      await tf.setBackend('webgl');
      await tf.ready();

      this.faceDetector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'mediapipe',
          solutionPath: '/models/face_mesh',
        } as any
      );

      this.bodySegmenter = await bodySegmentation.createSegmenter(
        bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
        {
          runtime: 'mediapipe',
          solutionPath: '/models/selfie_segmentation',
        }
      );
      this.modelsLoaded = true;
    } catch (error) {
      console.error('❌ 模型加载失败:', error);
      throw new Error('Failed to load face detection models');
    }
  }

  private getFaceArea(multiple: number, frameData: ImageBitmap, area: { x: number, y: number, width: number, height: number }): string {
    const expandedWidth = area.width * multiple;
    const expandedHeight = area.height * multiple;

    const centerX = area.x + area.width / 2;
    const centerY = area.y + area.height / 2;

    const { width, height } = frameData;

    const newXMin = Math.max(0, centerX - expandedWidth / 2);
    const newYMin = Math.max(0, centerY - expandedHeight / 2);
    const newWidth = Math.min(expandedWidth, width - newXMin);
    const newHeight = Math.min(expandedHeight, height - newYMin);

    const ctx = this.getCanvasContext(newWidth, newHeight);
    if (!ctx || !this.canvasCache) {
      throw new Error('无法获取canvas上下文或canvas缓存');
    }
    ctx.drawImage(frameData, newXMin, newYMin, newWidth, newHeight, 0, 0, newWidth, newHeight);
    return this.canvasCache.toDataURL();
  }

  async detectFaces(options: { base64: string; minArea?: number; maxArea?: number; minConfidence?: number; maxFaceAngle?: number; requireFrontalFace?: boolean }): Promise<{ results: FaceDetectionResult[] }> {
    const {
      base64,
      minArea = 0.05,
      maxArea = 0.3,
      minConfidence = 0.7,
      maxFaceAngle = 30,
      requireFrontalFace = true
    } = options;

    if (!this.modelsLoaded || !this.faceDetector) {
      await this.loadModels();
    }

    const frameData = await this.base64ToImageBitmap(base64);

    try {
      const predictions = await this.faceDetector!.estimateFaces(frameData, { flipHorizontal: false });
      const predictionsLength = predictions.length;
      let bestFace: FaceDetectionResult | null = null;
      let bestArea = 0;

      for (let i = 0; i < predictionsLength; i++) {
        const prediction = predictions[i];
        const box = prediction.box;

        const xMin = box.xMin ?? 0;
        const yMin = box.yMin ?? 0;
        const width = box.width ?? (box.xMax - xMin);
        const height = box.height ?? (box.yMax - yMin);

        const area = width * height;
        const frameArea = frameData.width * frameData.height;
        const areaRatio = area / (frameArea || 1);

        // 计算综合置信度
        const confidence = this.calculateFaceConfidenceWeb(prediction);

        // 检查是否为正脸
        const isFrontalFace = this.isFrontalFaceWeb(prediction, maxFaceAngle);
        if (requireFrontalFace && !isFrontalFace) {
          continue; // 跳过非正脸
        }

        // 应用面积/占比阈值过滤（支持上下限）
        const areaOk = (minArea <= 1 && maxArea <= 1) ? 
          (areaRatio >= minArea && areaRatio <= maxArea) : 
          (area >= minArea && area <= maxArea);
        if (!areaOk || confidence < minConfidence) continue;

        // 只保留面积最大的人脸（最靠近相机）
        if (area > bestArea) {
          const imageUrl = this.getFaceArea(1.5, frameData, { x: xMin, y: yMin, width, height });
          
          bestFace = {
            area,
            confidence,
            box: { x: xMin, y: yMin, width, height },
            imageUrl
          };
          bestArea = area;
        }
      }
      
      // 只返回最好的一个人脸
      return { results: bestFace ? [bestFace] : [] };
    } catch (error) {
      console.error('Face detection failed:', error);
      return { results: [] };
    } finally {
      frameData.close();
    }
  }

  async detectPersons(options: { base64: string; maxPersons?: number; minCoverage?: number }): Promise<{ results: PersonDetectionResult[] }> {
    const { base64, maxPersons = 1, minCoverage = 12 } = options;

    if (!this.modelsLoaded || !this.bodySegmenter) {
      await this.loadModels();
    }

    const frameData = await this.base64ToImageBitmap(base64);

    try {
      if (!this.bodySegmenter) {
        throw new Error('Body segmenter not initialized');
      }

      const segmentation = await this.bodySegmenter.segmentPeople(frameData, {
        multiSegmentation: false,
        segmentBodyParts: false,
      });

      if (!segmentation?.length) return { results: [] };

      const results: PersonDetectionResult[] = [];
      const { width, height } = frameData;
      const totalPixels = width * height;

      for (let i = 0; i < Math.min(segmentation.length, maxPersons); i++) {
        const segment = segmentation[i];
        const maskImageData = await segment.mask.toImageData();
        const maskData = maskImageData.data;

        let validPixels = 0;
        for (let j = 0; j < maskData.length; j += 4) {
          if (maskData[j] > 128) {
            validPixels++;
          }
        }

        const coverage = (validPixels / totalPixels) * 100;
        if (coverage > minCoverage) {
          results.push({ coverage });
        }
      }

      return { results };
    } catch (error) {
      console.error('Person detection failed:', error);
      return { results: [] };
    } finally {
      frameData.close();
    }
  }

  async isModelsLoaded(): Promise<{ loaded: boolean }> {
    return { loaded: this.modelsLoaded };
  }

  async dispose(): Promise<void> {
    try {
      if (this.faceDetector) {
        this.faceDetector = null;
      }

      if (this.bodySegmenter) {
        this.bodySegmenter = null;
      }

      if (this.canvasCache) {
        const ctx = this.canvasCache.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, this.canvasCache.width, this.canvasCache.height);
        }
      }

      this.modelsLoaded = false;
    } catch (error) {
      console.error('释放模型资源失败:', error);
    }
  }

  private async base64ToImageBitmap(base64: string): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        createImageBitmap(img)
          .then(resolve)
          .catch(reject);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image from base64'));
      };
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  }

  /**
   * Web 端计算人脸置信度
   * 基于人脸关键点和检测质量进行综合评分
   */
  private calculateFaceConfidenceWeb(prediction: any): number {
    // TensorFlow.js 人脸检测返回的置信度信息有限
    // 使用关键点数量和人脸完整性作为置信度依据

    const keypoints = prediction.keypoints || [];
    const faceOval = prediction.faceOval || [];

    // 基础置信度
    let confidence = 0.7;

    // 关键点数量影响置信度
    if (keypoints.length > 400) {
      confidence += 0.1; // 关键点丰富，质量更高
    } else if (keypoints.length < 200) {
      confidence -= 0.2; // 关键点较少，质量较低
    }

    // 人脸轮廓完整性影响置信度
    if (faceOval.length > 0) {
      confidence += 0.1; // 有完整的人脸轮廓
    }

    // 确保置信度在合理范围内
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Web 端检查是否为正脸
   * 基于人脸关键点位置精确判断是否面向镜头
   */
  private isFrontalFaceWeb(prediction: any, maxFaceAngle: number): boolean {
    const keypoints = prediction.keypoints || [];

    if (keypoints.length === 0) {
      return false;
    }

    // 查找关键特征点（使用MediaPipe Face Mesh的索引）
    const leftEyeCorner = keypoints[33];  // 左眼内角
    const rightEyeCorner = keypoints[263]; // 右眼内角
    const noseTip = keypoints[1];          // 鼻尖
    const leftEyeCenter = keypoints[468];  // 左瞳孔中心
    const rightEyeCenter = keypoints[473]; // 右瞳孔中心
    
    if (!leftEyeCorner || !rightEyeCorner || !noseTip) {
      return true; // 找不到关键点时宽松处理
    }

    // 1. 计算眼部水平线倾斜角度
    const eyeDistanceX = rightEyeCorner.x - leftEyeCorner.x;
    const eyeDistanceY = rightEyeCorner.y - leftEyeCorner.y;
    const eyeTiltAngle = Math.abs(Math.atan2(eyeDistanceY, eyeDistanceX) * (180 / Math.PI));

    // 2. 计算鼻子相对于两眼中点的偏移程度（侧脸判断）
    const eyeCenterX = (leftEyeCorner.x + rightEyeCorner.x) / 2;
    const noseOffsetX = Math.abs(noseTip.x - eyeCenterX);
    const eyeDistance = Math.abs(eyeDistanceX);
    const noseOffsetRatio = noseOffsetX / (eyeDistance + 0.001); // 避免除零

    // 3. 综合判断：眼部倾斜 + 鼻子偏移
    const isEyeTiltOk = eyeTiltAngle <= maxFaceAngle;
    const isNosePositionOk = noseOffsetRatio <= 0.3; // 鼻子偏移不应超过眼距的30%

    // 4. 如果有瞳孔中心数据，进一步验证
    let isPupilSymmetric = true;
    if (leftEyeCenter && rightEyeCenter) {
      const pupilDistanceY = Math.abs(leftEyeCenter.y - rightEyeCenter.y);
      const pupilDistance = Math.abs(leftEyeCenter.x - rightEyeCenter.x);
      const pupilAsymmetryRatio = pupilDistanceY / (pupilDistance + 0.001);
      isPupilSymmetric = pupilAsymmetryRatio <= 0.15; // 瞳孔高度差不应过大
    }

    return isEyeTiltOk && isNosePositionOk && isPupilSymmetric;
  }
}
