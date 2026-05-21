export interface FaceDetectionResult {
  area: number;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageUrl?: string;
}

export interface PersonDetectionResult {
  coverage: number;
}

export interface LzwcDetectionPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;

  loadModels(): Promise<void>;

  detectFaces(options: {
    base64: string;
    minArea?: number;
    maxArea?: number;          // 最大人脸面积，用于距离上限控制
    minConfidence?: number;
    maxFaceAngle?: number;     // 最大人脸角度（度），用于正脸判断
    requireFrontalFace?: boolean; // 是否只检测正脸
  }): Promise<{ results: FaceDetectionResult[] }>;

  detectPersons(options: {
    base64: string;
    maxPersons?: number;
    minCoverage?: number;
  }): Promise<{ results: PersonDetectionResult[] }>;

  isModelsLoaded(): Promise<{ loaded: boolean }>;

  dispose(): Promise<void>;
}
