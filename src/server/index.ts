// 导出所有API服务
export { DeviceApi } from './api/deviceApi'
export { FaceApi } from './api/faceApi'
export { UpdateApi } from './api/updateApi'
export { UserApi } from './api/userApi'

// 导出基础HTTP客户端
export { HttpClient } from './httpClient'

// 导出通用类型
export type { ApiResponse } from './httpClient'
export type { DeviceReportRequest, DeviceReportResponse, DeviceParamsConfig, DeviceInfoResponse } from './api/deviceApi'
export type { FaceRecognitionResponse } from './api/faceApi'
export type { LiveUpdateResponse, ApkUpdateResponse } from './api/updateApi'
export type { SilentLoginRequest, SilentLoginResponse } from './api/userApi'
