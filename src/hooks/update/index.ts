/* eslint-disable @typescript-eslint/no-explicit-any */
import { reactive, readonly } from 'vue'
import { checkFirmwareUpdate, getFirmwareDownloadURL } from '@/server/api/versionApi'
import type { FirmwareCheckResponse } from '@/server/api/versionApi'
import ApkUpdater from 'cordova-plugin-apkupdater'
import { LiveUpdate } from '@capawesome/capacitor-live-update'
import { Capacitor } from '@capacitor/core'

/**
 * 断言当前运行在原生环境
 */
const ensureNativePlatform = () => {
    if (!Capacitor.isNativePlatform()) {
        throw new Error('当前运行在浏览器环境，无法执行原生更新，请在设备上测试。')
    }
}

/**
 * 断言 ApkUpdater 插件可用
 */
const ensureApkUpdaterAvailable = () => {
    ensureNativePlatform()
    if (!ApkUpdater || typeof ApkUpdater.getInstalledVersion !== 'function') {
        throw new Error('ApkUpdater 插件不可用，请确认已安装并通过 npx cap sync 同步。')
    }
}

/**
 * 更新状态
 */
export interface UpdateState {
    /** 是否正在检查更新 */
    isChecking: boolean
    /** 是否正在下载 */
    isDownloading: boolean
    /** 是否正在安装 */
    isInstalling: boolean
    /** 下载进度 (0-100) */
    downloadProgress: number
    /** 错误信息 */
    error: string | null
}

/**
 * 更新回调函数类型
 */
export interface UpdateCallbacks {
    /** 检查更新开始 */
    onCheckStart?: () => void
    /** 检查更新完成 */
    onCheckComplete?: (hasUpdate: boolean) => void
    /** 下载开始 */
    onDownloadStart?: () => void
    /** 下载进度 */
    onDownloadProgress?: (progress: number) => void
    /** 下载完成 */
    onDownloadComplete?: () => void
    /** 安装开始 */
    onInstallStart?: () => void
    /** 更新成功 */
    onUpdateSuccess?: () => void
    /** 更新失败 */
    onUpdateError?: (error: string) => void
}

/**
 * 更新 Hook
 * @param callbacks 更新回调函数
 * @returns 更新相关的方法和状态
 */
export function useUpdate(callbacks?: UpdateCallbacks) {
    const state = reactive<UpdateState>({
        isChecking: false,
        isDownloading: false,
        isInstalling: false,
        downloadProgress: 0,
        error: null,
    })

    /**
     * 校验版本号是否合法
     * 合法格式如 1.0.0、2.3、10.2.1 等
     */
    const isValidVersion = (version: string): boolean => {
        return /^\d+(\.\d+){1,2}$/.test(version)
    }

    /**
     * 校验URL是否合法
     */
    const isValidUrl = (url: string): boolean => {
        return /^https?:\/\/.+/.test(url)
    }

    /**
     * 对比两个版本号
     * @param v1 版本号1
     * @param v2 版本号2
     * @returns v1>v2返回1，v1<v2返回-1，相等返回0
     */
    const compareVersion = (v1: string, v2: string): number => {
        if (!isValidVersion(v1) || !isValidVersion(v2)) {
            return -1
        }
        const arr1 = v1.split('.').map(Number)
        const arr2 = v2.split('.').map(Number)
        const len = Math.max(arr1.length, arr2.length)

        for (let i = 0; i < len; i++) {
            const n1 = arr1[i] || 0
            const n2 = arr2[i] || 0
            if (n1 > n2) return 1
            if (n1 < n2) return -1
        }
        return 0
    }


    /**
     * 检查是否有可用更新
     * @param currentVersion 当前版本号
     * @returns Promise<FirmwareCheckResponse | null> 如果有更新返回版本信息，否则返回null
     */
    const checkForUpdate = async (currentVersion: string): Promise<FirmwareCheckResponse | null> => {
        try {
            const res = await checkFirmwareUpdate(currentVersion)
            if ((res.code === 200 || res.code === 1000) && res.data) {
                // 检查状态是否为可用（status === 1）
                if (res.data.status === 1) {
                    return res.data
                }
                console.log('ℹ️ [Update] 版本状态不可用:', res.data.status)
                return null
            }
            console.warn('⚠️ [Update] 版本接口返回异常:', res)
            return null
        } catch (error) {
            console.error('❌ [Update] 检查更新失败:', error)
            return null
        }
    }

    /**
     * 获取下载地址
     * @param version 版本号
     * @returns Promise<string> 下载地址
     */
    const getDownloadURL = async (version: string): Promise<string> => {
        try {
            const res = await getFirmwareDownloadURL(version)
            if ((res.code === 200 || res.code === 1000) && res.data) {
                return res.data
            }
            throw new Error(res.message || res.msg || '获取下载地址失败')
        } catch (error: any) {
            console.error('❌ [Update] 获取下载地址失败:', error)
            throw error
        }
    }

    /**
     * 获取当前应用版本名称
     * 从 APK 获取原生版本号
     */
    const getCurrentVersion = async (): Promise<string> => {
        try {
            ensureApkUpdaterAvailable()
            const result = await ApkUpdater.getInstalledVersion()
            const apkVersion = result.version.name
            console.log('📱 [Update] 从 APK 获取版本号:', apkVersion)
            return apkVersion
        } catch (error) {
            console.error('获取当前版本失败：', error)
            throw error
        }
    }

    /**
     * 全量更新 - 下载并安装 APK（直接使用 URL）
     */
    const downloadAndInstallApkDirect = async (downloadUrl: string): Promise<void> => {
        try {
            ensureApkUpdaterAvailable()
            state.isDownloading = true
            state.downloadProgress = 0
            callbacks?.onDownloadStart?.()

            console.log('📦 [Update] 开始下载 APK:', downloadUrl)

            await ApkUpdater.download(
                downloadUrl,
                {
                    onDownloadProgress: (e) => {
                        const progress = Math.round((e.bytesWritten / e.bytes) * 100)
                        state.downloadProgress = progress
                        callbacks?.onDownloadProgress?.(progress)
                        console.log(`📥 [Update] 下载进度: ${progress}% (${e.bytesWritten}/${e.bytes})`)
                    },
                    onUnzipProgress: (e) => {
                        const progress = Math.round((e.bytesWritten / e.bytes) * 100)
                        console.log(`🗜️ [Update] 解压进度: ${progress}% (${e.bytesWritten}/${e.bytes})`)
                    },
                },
                async () => {
                    console.log('✅ [Update] APK 下载完成，开始安装')
                    state.isDownloading = false
                    state.isInstalling = true
                    callbacks?.onDownloadComplete?.()
                    callbacks?.onInstallStart?.()

                    await ApkUpdater.install()
                    console.log('✅ [Update] APK 安装完成')
                    state.isInstalling = false
                    callbacks?.onUpdateSuccess?.()
                }
            )
        } catch (error: any) {
            const errorMessage = error?.message || 'APK 下载或安装失败'
            console.error('❌ [Update] APK 更新失败:', errorMessage)
            state.error = errorMessage
            state.isDownloading = false
            state.isInstalling = false
            callbacks?.onUpdateError?.(errorMessage)
            throw error
        }
    }

    /**
     * 执行全量更新（自动处理 root/权限）
     */
    const executeFullUpdate = async (downloadUrl: string, version: string): Promise<void> => {
        console.log('🔄 [Update] 准备执行全量更新:', version, downloadUrl)

        const isRooted = await ApkUpdater.isDeviceRooted()
        if (!isRooted) {
            const canInstall = await ApkUpdater.canRequestPackageInstalls()
            if (!canInstall) {
                console.warn('⚠️ [Update] 没有安装权限，需要用户授权')
            }
        }

        await downloadAndInstallApkDirect(downloadUrl)
    }

    /**
     * 仅检查是否有可用更新（不执行更新）
     * @returns Promise<FirmwareCheckResponse | null> 如果有更新返回版本信息，否则返回null
     */
    const checkForUpdateOnly = async (): Promise<FirmwareCheckResponse | null> => {
        try {
            ensureApkUpdaterAvailable()
            state.isChecking = true
            state.error = null
            callbacks?.onCheckStart?.()

            // 获取当前版本
            const currentVersion = await getCurrentVersion()
            console.log('📱 [Update] 当前版本:', currentVersion)

            // 检查是否有可用更新
            const updateInfo = await checkForUpdate(currentVersion)

            if (!updateInfo) {
                console.log('ℹ️ [Update] 当前已是最新版本或没有可用更新')
                state.isChecking = false
                callbacks?.onCheckComplete?.(false)
                return null
            }

            const newVersion = updateInfo.version
            console.log('🆕 [Update] 发现新版本:', newVersion)

            // 验证版本号格式
            if (!isValidVersion(newVersion)) {
                throw new Error(`版本号格式不合法: ${newVersion}`)
            }

            // 对比版本号
            const hasNewVersion = compareVersion(newVersion, currentVersion) === 1
            if (!hasNewVersion) {
                console.log('ℹ️ [Update] 当前版本已是最新或更高')
                state.isChecking = false
                callbacks?.onCheckComplete?.(false)
                return null
            }

            state.isChecking = false
            callbacks?.onCheckComplete?.(true)
            return updateInfo
        } catch (error: any) {
            const errorMessage = error?.message || '更新检查失败'
            console.error('❌ [Update] 更新检查失败:', errorMessage)
            state.error = errorMessage
            state.isChecking = false
            callbacks?.onCheckComplete?.(false)
            return null
        }
    }

    /**
     * 检查应用是否需要更新（并执行更新）
     */
    const checkUpdate = async (): Promise<boolean> => {
        try {
            ensureApkUpdaterAvailable()
            state.isChecking = true
            state.error = null
            callbacks?.onCheckStart?.()

            // 获取当前版本
            const currentVersion = await getCurrentVersion()
            console.log('📱 [Update] 当前版本:', currentVersion)

            // 检查是否有可用更新
            const updateInfo = await checkForUpdate(currentVersion)

            if (!updateInfo) {
                console.log('ℹ️ [Update] 当前已是最新版本或没有可用更新')
                state.isChecking = false
                callbacks?.onCheckComplete?.(false)
                return false
            }

            const newVersion = updateInfo.version
            console.log('🆕 [Update] 发现新版本:', newVersion)

            // 验证版本号格式
            if (!isValidVersion(newVersion)) {
                throw new Error(`版本号格式不合法: ${newVersion}`)
            }

            // 对比版本号
            const hasNewVersion = compareVersion(newVersion, currentVersion) === 1
            if (!hasNewVersion) {
                console.log('ℹ️ [Update] 当前版本已是最新或更高')
                state.isChecking = false
                callbacks?.onCheckComplete?.(false)
                return false
            }

            // 获取下载地址
            const downloadUrl = await getDownloadURL(newVersion)
            console.log('📥 [Update] 下载地址:', downloadUrl)

            if (!isValidUrl(downloadUrl)) {
                throw new Error('下载地址不合法')
            }

            state.isChecking = false
            callbacks?.onCheckComplete?.(true)

            // 执行全量更新（新接口只支持APK全量更新）
            console.log('🔄 [Update] 执行全量更新:', newVersion)
            await executeFullUpdate(downloadUrl, newVersion)

            return true
        } catch (error: any) {
            const errorMessage = error?.message || '更新检查失败'
            console.error('❌ [Update] 更新检查失败:', errorMessage)
            state.error = errorMessage
            state.isChecking = false
            callbacks?.onCheckComplete?.(false)
            callbacks?.onUpdateError?.(errorMessage)
            return false
        }
    }

    /**
     * 应用启动时检查更新
     */
    const initUpdateCheck = async (): Promise<void> => {
        try {
            if (!Capacitor.isNativePlatform()) {
                console.log('ℹ️ [Update] 非原生平台，跳过更新检查')
                return
            }

            await LiveUpdate.ready()
            await checkUpdate()
        } catch (error) {
            console.error('❌ [Update] 初始化更新检查失败:', error)
        }
    }

    return {
        state: readonly(state),
        checkUpdate,
        checkForUpdateOnly,
        initUpdateCheck,
        getCurrentVersion,
        executeFullUpdate,
    }
}

