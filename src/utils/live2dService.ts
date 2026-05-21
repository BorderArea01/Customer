import * as PIXI from 'pixi.js'

// 设置全局PIXI
;(window as any).PIXI = PIXI

// 类型声明
declare global {
  interface Window {
    PIXI: any
  }
}

export interface Live2DModelConfig {
  modelPath: string
  autoInteract?: boolean
  position?: { xPercent: number; yPercent: number }
  scale?: number
  widthPercent?: number
  heightPercent?: number
  // 向后兼容的旧配置
  width?: number
  height?: number
}

export class Live2DService {
  private app: any = null
  private model: any = null
  private modelConfig: Live2DModelConfig

  constructor(config: Live2DModelConfig) {
    this.modelConfig = {
      autoInteract: false,
      position: { xPercent: -0.14, yPercent: 0.08 },
      scale: 1,
      widthPercent: undefined,
      heightPercent: undefined,
      width: undefined,
      height: undefined,
      ...config
    }
  }

  /**
   * 初始化Live2D模型
   */
  async init(canvas: HTMLCanvasElement): Promise<{
    availableExpressions: any[]
    availableMotions: Record<string, any[]>
  }> {
    // 保存 canvas 引用，用于后续检查
    const originalCanvas = canvas
    
    // 初始化Live2D模型
    
    // 检查模型文件是否存在
    try {
      const response = await fetch(this.modelConfig.modelPath)
      if (!response.ok) {
        throw new Error(`模型文件不存在: ${this.modelConfig.modelPath}`)
      }
    } catch (error) {
      console.error('❌ [Live2DService] 模型文件检查失败:', error)
      throw new Error(`模型文件检查失败: ${error}`)
    }
    
    try {
      // 获取屏幕尺寸
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight

      // 检查WebGL支持，如果不支持则使用canvas渲染器
      let useWebGL = true
      try {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        if (!gl) {
          useWebGL = false
          console.warn('⚠️ [Live2DService] WebGL不支持，将使用Canvas渲染器')
        }
      } catch (error) {
        useWebGL = false
        console.warn('⚠️ [Live2DService] WebGL检查失败，将使用Canvas渲染器:', error)
      }

      // 创建PIXI实例
      const pixiConfig: any = {
        view: canvas,
        width: screenWidth,
        height: screenHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      }
      
      // 如果不支持WebGL，强制使用canvas渲染器
      if (!useWebGL) {
        pixiConfig.forceCanvas = true
        console.log('📝 [Live2DService] 使用Canvas渲染器创建PIXI应用')
      }
      
      // 创建PIXI应用实例
      try {
        this.app = new PIXI.Application(pixiConfig)
        
        // 验证应用是否创建成功
        if (!this.app || !this.app.stage) {
          throw new Error('PIXI应用创建失败：应用或舞台为null')
        }
        
        // 立即验证 canvas 是否还存在（可能在创建过程中被移除）
        if (!canvas || !document.body.contains(canvas)) {
          console.warn('⚠️ [Live2DService] Canvas元素在PIXI应用创建后被移除')
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
          throw new Error('Canvas元素在PIXI应用创建后被移除')
        }
        
        // 验证 PIXI 应用绑定的 canvas 是否匹配
        if (this.app.view !== canvas) {
          console.warn('⚠️ [Live2DService] PIXI应用绑定的canvas与当前canvas不匹配')
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
          throw new Error('PIXI应用绑定的canvas与当前canvas不匹配')
        }
        
        console.log('✅ [Live2DService] PIXI应用创建成功')
      } catch (error) {
        console.error('❌ [Live2DService] PIXI应用创建失败:', error)
        this.app = null
        throw error instanceof Error ? error : new Error(`PIXI应用创建失败: ${String(error)}`)
      }

      // 验证模型路径
      if (!this.modelConfig.modelPath) {
        // 清理已创建的应用
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('模型路径不能为空，必须等待配置加载完成')
      }
      
      // 在引入模块前再次检查应用状态和 canvas
      if (!this.app || !this.app.stage) {
        console.warn('⚠️ [Live2DService] PIXI应用在引入模块前已被销毁')
        throw new Error('PIXI应用在引入模块前已被销毁')
      }
      
      if (!canvas || !document.body.contains(canvas) || this.app.view !== canvas) {
        console.warn('⚠️ [Live2DService] Canvas元素在引入模块前被移除或不匹配')
        // 清理已创建的应用
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('Canvas元素在引入模块前被移除或不匹配')
      }
      
      // 引入live2d模型文件
      const Live2DModule = await import('pixi-live2d-display/cubism4')
      const Live2DModel = Live2DModule.Live2DModel
      
      // 加载模型
      console.log('📦 [Live2DService] 开始加载模型:', this.modelConfig.modelPath)
      
      // 在加载模型前再次验证应用是否存在
      if (!this.app || !this.app.stage) {
        console.warn('⚠️ [Live2DService] PIXI应用在模型加载前已被销毁')
        throw new Error('PIXI应用在模型加载前已被销毁')
      }
      
      // 再次验证 canvas
      if (!canvas || !document.body.contains(canvas) || this.app.view !== canvas) {
        console.warn('⚠️ [Live2DService] Canvas元素在模型加载前被移除或不匹配')
        // 清理已创建的应用
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('Canvas元素在模型加载前被移除或不匹配')
      }
      
      // 加载模型（异步操作）
      this.model = await Live2DModel.from(this.modelConfig.modelPath, {
        autoInteract: this.modelConfig.autoInteract,
      })
      console.log('✅ [Live2DService] 模型加载成功')

      // 再次验证应用是否还存在（可能在异步加载模型过程中被销毁）
      if (!this.app || !this.app.stage) {
        console.warn('⚠️ [Live2DService] PIXI应用在模型加载过程中被销毁')
        // 清理已加载的模型
        if (this.model) {
          try {
            this.model.destroy()
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理模型失败:', error)
          }
          this.model = null
        }
        throw new Error('PIXI应用在模型加载过程中被销毁')
      }
      
      // 验证 canvas 元素是否还存在且匹配
      // 检查 canvas 是否还在 DOM 中
      if (!canvas) {
        console.warn('⚠️ [Live2DService] Canvas元素在模型加载过程中变为null')
        // 清理已创建的应用
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('Canvas元素在模型加载过程中被移除')
      }
      
      // 检查 canvas 是否还在 DOM 树中（使用保存的原始引用）
      // 首先检查原始 canvas 是否还在 DOM 中
      const originalCanvasInDOM = originalCanvas && (document.body.contains(originalCanvas) || document.documentElement.contains(originalCanvas))
      const originalCanvasHasParent = originalCanvas && originalCanvas.parentNode !== null
      
      // 然后查找当前 DOM 中的 canvas 元素
      const currentCanvas = document.querySelector('#live2d-canvas') as HTMLCanvasElement
      const isSameCanvas = currentCanvas === originalCanvas
      
      // 如果原始 canvas 不在 DOM 中，或者当前找到的 canvas 不是原始 canvas，说明 canvas 被移除或替换了
      if (!originalCanvasInDOM || !originalCanvasHasParent || !isSameCanvas) {
        console.warn('⚠️ [Live2DService] Canvas元素在模型加载过程中从DOM中移除或被替换', {
          originalCanvasInDOM,
          originalCanvasHasParent,
          isSameCanvas,
          hasCurrentCanvas: !!currentCanvas,
          originalCanvasId: originalCanvas.id,
          currentCanvasId: currentCanvas?.id,
          originalCanvasParent: originalCanvas.parentNode,
          currentCanvasParent: currentCanvas?.parentNode
        })
        // 清理已创建的应用和模型
        if (this.model) {
          try {
            this.model.destroy()
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理模型失败:', error)
          }
          this.model = null
        }
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('Canvas元素在模型加载过程中被移除')
      }
      
      // 使用原始 canvas（确保使用正确的引用，因为我们已经验证了 currentCanvas === originalCanvas）
      const canvasToUse = originalCanvas
      
      // 验证 PIXI 应用绑定的 canvas 是否匹配（使用 canvasToUse）
      if (this.app.view !== canvasToUse) {
        console.warn('⚠️ [Live2DService] PIXI应用绑定的canvas与当前canvas不匹配', {
          appView: this.app.view,
          canvasToUse: canvasToUse,
          appViewId: this.app.view?.id,
          canvasToUseId: canvasToUse.id
        })
        // 清理已创建的应用和模型
        if (this.model) {
          try {
            this.model.destroy()
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理模型失败:', error)
          }
          this.model = null
        }
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('PIXI应用绑定的canvas与当前canvas不匹配')
      }

      // 计算最佳缩放比例和位置
      this.calculateModelTransform(screenWidth, screenHeight)

      // 再次验证应用是否还存在（可能在计算变换过程中被销毁）
      if (!this.app || !this.app.stage) {
        console.warn('⚠️ [Live2DService] PIXI应用在添加模型前已被销毁')
        // 清理已加载的模型
        if (this.model) {
          try {
            this.model.destroy()
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理模型失败:', error)
          }
          this.model = null
        }
        throw new Error('PIXI应用在添加模型前已被销毁')
      }
      
      // 再次检查 canvas 是否还存在（可能在计算变换过程中被移除）
      const finalCanvasCheck = document.querySelector('#live2d-canvas') as HTMLCanvasElement
      if (!finalCanvasCheck || finalCanvasCheck !== canvasToUse || finalCanvasCheck !== originalCanvas) {
        console.warn('⚠️ [Live2DService] Canvas元素在添加模型前被移除或替换')
        // 清理已加载的模型
        if (this.model) {
          try {
            this.model.destroy()
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理模型失败:', error)
          }
          this.model = null
        }
        if (this.app) {
          try {
            this.app.destroy(true)
          } catch (error) {
            console.warn('⚠️ [Live2DService] 清理应用失败:', error)
          }
          this.app = null
        }
        throw new Error('Canvas元素在添加模型前被移除或替换')
      }

      // 把模型添加到舞台上
      this.app.stage.addChild(this.model)
      
      console.log('✅ [Live2DService] 模型已添加到舞台，开始渲染')

      // 获取可用表情和动作
      const availableExpressions = this.getAvailableExpressions()
      const availableMotions = this.getAvailableMotions()

      return { availableExpressions, availableMotions }
    } catch (error) {
      console.error('❌ [Live2DService] Live2D模型初始化失败:', error)
      console.error('❌ [Live2DService] 错误详情:', JSON.stringify({
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, null, 2))
      throw error
    }
  }

  /**
   * 计算模型变换
   */
  private calculateModelTransform(screenWidth: number, screenHeight: number) {
    let scale, x, y

    // 优先使用新的相对值配置
    if (this.modelConfig.widthPercent && this.modelConfig.heightPercent) {
      // 改进的缩放逻辑：基于屏幕对角线长度计算统一缩放比例
      const screenDiagonal = Math.sqrt(screenWidth * screenWidth + screenHeight * screenHeight)
      const modelDiagonal = Math.sqrt(this.model.width * this.model.width + this.model.height * this.model.height)
      
      // 使用对角线长度的百分比来计算缩放，确保在不同宽高比设备上保持一致
      const targetDiagonal = screenDiagonal * Math.min(this.modelConfig.widthPercent, this.modelConfig.heightPercent)
      scale = targetDiagonal / modelDiagonal
      
    } else if (this.modelConfig.width && this.modelConfig.height) {
      // 向后兼容：使用固定尺寸计算缩放
      const scaleX = this.modelConfig.width / this.model.width
      const scaleY = this.modelConfig.height / this.model.height
      scale = Math.min(scaleX, scaleY) // 保持宽高比，取较小的缩放值
    } else {
      // 使用原有的自适应缩放逻辑
      const modelAspectRatio = this.model.width / this.model.height
      const screenAspectRatio = screenWidth / screenHeight

      if (modelAspectRatio > screenAspectRatio) {
        scale = (screenWidth * 0.8) / this.model.width
      } else {
        scale = (screenHeight * 0.9) / this.model.height
      }
    }

    // 计算位置：优先使用相对值配置
    if (this.modelConfig.position?.xPercent !== undefined && this.modelConfig.position?.yPercent !== undefined) {
      x = screenWidth * this.modelConfig.position.xPercent
      y = screenHeight * this.modelConfig.position.yPercent
    } else {
      // 向后兼容：使用固定位置
      x = (this.modelConfig.position as any)?.x || 0
      y = (this.modelConfig.position as any)?.y || 0
    }

    // 应用缩放和位置
    this.model.scale.set(scale * (this.modelConfig.scale || 1))
    this.model.x = x
    this.model.y = y
    
  }

  /**
   * 获取可用表情
   */
  private getAvailableExpressions(): any[] {
    if (this.model?.internalModel?.settings?.expressions) {
      return this.model.internalModel.settings.expressions
    }
    return []
  }

  /**
   * 获取可用动作
   */
  private getAvailableMotions(): Record<string, any[]> {
    if (this.model?.internalModel?.settings?.motions) {
      return this.model.internalModel.settings.motions
    }
    return {}
  }

  /**
   * 播放表情
   */
  playExpression(expressionId: string) {
    if (this.model && this.model.internalModel) {
      try {
        // 尝试不同的API调用方式
        if (typeof this.model.internalModel.expression === 'function') {
          this.model.internalModel.expression(expressionId)
        } else if (typeof this.model.expression === 'function') {
          this.model.expression(expressionId)
        } else if (this.model.internalModel.coreModel) {
          // 使用coreModel的expression方法
          this.model.internalModel.coreModel.expression(expressionId)
        } else {
          console.warn('无法找到可用的expression方法，尝试使用参数控制')
          // 对于xiaolongren等模型，可能需要直接设置参数
          this.setParameterValue(expressionId, 1)
        }
      } catch (error) {
        console.error('播放表情失败:', error)
        // 如果expression失败，尝试使用参数控制
        this.setParameterValue(expressionId, 1)
      }
    }
  }

  /**
   * 设置参数值
   */
  setParameterValue(paramId: string, value: number) {
    if (this.model && this.model.internalModel) {
      try {
        if (this.model.internalModel.coreModel) {
          this.model.internalModel.coreModel.setParameterValueById(paramId, value)
        } else if (this.model.internalModel.setParameterValueById) {
          this.model.internalModel.setParameterValueById(paramId, value)
        } else if (this.model.setParameterValueById) {
          this.model.setParameterValueById(paramId, value)
        } else {
          console.warn('无法找到可用的参数设置方法')
        }
      } catch (error) {
        console.error('设置参数失败:', error)
      }
    }
  }

  /**
   * 播放动作
   */
  playMotion(motionGroup: string, motionId: string) {
    if (this.model && this.model.internalModel) {
      try {
        // 尝试不同的API调用方式
        if (typeof this.model.internalModel.motion === 'function') {
          this.model.internalModel.motion(motionGroup, motionId)
        } else if (typeof this.model.motion === 'function') {
          this.model.motion(motionGroup, motionId)
        } else if (this.model.internalModel.coreModel) {
          // 使用coreModel的motion方法
          this.model.internalModel.coreModel.motion(motionGroup, motionId)
        } else {
          console.warn('无法找到可用的motion方法')
        }
      } catch (error) {
        console.error('播放动作失败:', error)
      }
    }
  }

  /**
   * 设置模型位置
   */
  setPosition(x: number, y: number) {
    if (this.model) {
      this.model.x = x
      this.model.y = y
    }
  }

  /**
   * 设置模型缩放
   */
  setScale(scale: number) {
    if (this.model) {
      this.model.scale.set(scale)
    }
  }

  /**
   * 销毁模型（同步操作，确保立即完成）
   */
  destroy() {
    // 先标记应用为 null，防止在销毁过程中被其他操作使用
    const appToDestroy = this.app
    const modelToDestroy = this.model
    this.app = null
    this.model = null
    
    // 先清理模型
    try {
      if (modelToDestroy) {
        // 如果应用存在，先从舞台移除模型
        if (appToDestroy && appToDestroy.stage) {
          try {
            // 检查模型是否还在舞台上
            if (appToDestroy.stage.children.includes(modelToDestroy)) {
              appToDestroy.stage.removeChild(modelToDestroy)
            }
          } catch (error) {
            console.warn('⚠️ [Live2DService] 移除模型时出现警告:', error)
          }
        }
        
        // 销毁模型
        try {
          modelToDestroy.destroy()
        } catch (error) {
          console.warn('⚠️ [Live2DService] 销毁模型时出现警告:', error)
        }
      }
    } catch (error) {
      console.warn('⚠️ [Live2DService] 清理模型时出现警告:', error)
    }
    
    // 再销毁PIXI应用
    try {
      if (appToDestroy) {
        try {
          appToDestroy.destroy(true)
        } catch (error) {
          console.warn('⚠️ [Live2DService] 销毁PIXI应用时出现警告:', error)
        }
      }
    } catch (error) {
      console.warn('⚠️ [Live2DService] 销毁PIXI应用时出现警告:', error)
    }
  }

  /**
   * 获取模型实例
   */
  getModel() {
    return this.model
  }

  /**
   * 获取PIXI应用实例
   */
  getApp() {
    return this.app
  }
} 