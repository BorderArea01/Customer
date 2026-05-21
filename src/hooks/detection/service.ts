import { LzwcDetection } from 'capacitor-detection'

// 类型定义
export interface FaceDetectionResult {
  area: number;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageUrl?: string
}

export interface PersonDetectionResult {
  coverage: number; // 人物在画面中的覆盖率百分比
}

export class DetectionService {
  private modelsLoaded = false

  async loadModels(): Promise<void> {
    if (this.modelsLoaded) return

    try {
      await LzwcDetection.loadModels()
      const { loaded } = await LzwcDetection.isModelsLoaded()
      this.modelsLoaded = loaded
      console.log('模型加载完成')
    } catch (error) {
      console.error('模型加载失败:', error)
      throw error
    }
  }

  async detectFaces(
    base64PictureData: string,
    minArea: number,
    maxArea: number,
    minConfidence: number,
    maxFaceAngle: number,
    requireFrontalFace: boolean
  ): Promise<FaceDetectionResult[]> {
    if (!this.modelsLoaded) {
      await this.loadModels()
    }

    try {
      const { results } = await LzwcDetection.detectFaces({
        base64: base64PictureData,
        minArea,
        maxArea,
        minConfidence,
        maxFaceAngle,
        requireFrontalFace
      })

      return results
    } catch (error) {
      console.error('❌ 人脸检测失败:', error)
      return []
    }
  }

  async detectPersons(
    base64: string,
    maxPersons: number,
    minCoverage: number
  ): Promise<PersonDetectionResult[]> {
    if (!this.modelsLoaded) {
      await this.loadModels()
    }

    try {
      const { results } = await LzwcDetection.detectPersons({
        base64,
        maxPersons,
        minCoverage,
      })

      return results
    } catch (error) {
      console.error('Person detection failed:', error)
      return []
    }
  }

  async isModelsLoaded(): Promise<boolean> {
    const { loaded } = await LzwcDetection.isModelsLoaded()
    return loaded
  }

  /**
   * 释放模型资源，防止内存泄露
   */
  async dispose(): Promise<void> {
    try {
      await LzwcDetection.dispose()
      this.modelsLoaded = false
    } catch (error) {
      console.error('释放模型资源失败:', error)
    }
  }
}
