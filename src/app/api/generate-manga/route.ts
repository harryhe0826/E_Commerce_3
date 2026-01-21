import { NextRequest, NextResponse } from 'next/server'

/**
 * AI 漫画风格生成 API
 * 
 * 使用 Img2Img / ControlNet 逻辑将原始图片转换为漫画风格
 * 要求：保持原图内容 90% 以上，仅改变风格
 * 输出规格：9:16 比例
 */

interface GenerateRequest {
	imageBase64: string // 原始图片 base64 数据
	stylePrompt: string // 风格描述词
	frameId: string // 帧 ID，用于追踪
}

interface GenerateResponse {
	success: boolean
	frameId: string
	generatedImage?: string // 生成的图片 base64
	error?: string
}

// Stable Diffusion API 配置（占位）
const SD_API_CONFIG = {
	// 如果使用本地 Stable Diffusion WebUI
	localUrl: 'http://127.0.0.1:7860',
	// 如果使用云端 API（如 Replicate、Stability AI 等）
	cloudUrl: '',
}

/**
 * 构建 Stable Diffusion Img2Img 请求参数
 */
function buildSDImg2ImgPayload(imageBase64: string, stylePrompt: string) {
	// 移除 base64 前缀（如果有）
	const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

	return {
		// Img2Img 参数
		init_images: [base64Data],
		prompt: `${stylePrompt}, manga style, comic book art, hand-drawn illustration, high quality, detailed linework`,
		negative_prompt: 'blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, text, signature',
		// 强调图像保持 - denoising_strength 越低，保留原图越多
		denoising_strength: 0.35, // 0.3-0.4 保持 90% 以上原图内容
		// 9:16 比例
		width: 576,
		height: 1024,
		// 采样参数
		steps: 30,
		cfg_scale: 7,
		sampler_name: 'DPM++ 2M Karras',
		// ControlNet 参数（如果启用）
		alwayson_scripts: {
			controlnet: {
				args: [
					{
						enabled: true,
						module: 'canny', // 使用 Canny 边缘检测保持结构
						model: 'control_v11p_sd15_canny',
						weight: 0.8, // 控制强度
						guidance_start: 0,
						guidance_end: 1,
						processor_res: 512,
						threshold_a: 100,
						threshold_b: 200,
					},
				],
			},
		},
	}
}

/**
 * 构建 Replicate API 请求参数（云端备选方案）
 */
function buildReplicatePayload(imageBase64: string, stylePrompt: string) {
	return {
		version: 'stability-ai/sdxl:c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866bfb27c061316',
		input: {
			image: imageBase64,
			prompt: `${stylePrompt}, manga style, comic book art, anime illustration`,
			negative_prompt: 'blurry, low quality, distorted',
			strength: 0.35, // 保持原图内容
			num_inference_steps: 30,
			guidance_scale: 7,
		},
	}
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
	try {
		const body: GenerateRequest = await request.json()
		const { imageBase64, stylePrompt, frameId } = body

		// 验证参数
		if (!imageBase64) {
			return NextResponse.json({
				success: false,
				frameId,
				error: '缺少图片数据',
			}, { status: 400 })
		}

		if (!stylePrompt) {
			return NextResponse.json({
				success: false,
				frameId,
				error: '缺少风格描述',
			}, { status: 400 })
		}

		// ============================================
		// 方案 1: 调用本地 Stable Diffusion WebUI API
		// ============================================
		// const sdPayload = buildSDImg2ImgPayload(imageBase64, stylePrompt)
		// const sdResponse = await fetch(`${SD_API_CONFIG.localUrl}/sdapi/v1/img2img`, {
		// 	method: 'POST',
		// 	headers: { 'Content-Type': 'application/json' },
		// 	body: JSON.stringify(sdPayload),
		// })
		// const sdResult = await sdResponse.json()
		// if (sdResult.images && sdResult.images[0]) {
		// 	return NextResponse.json({
		// 		success: true,
		// 		frameId,
		// 		generatedImage: `data:image/png;base64,${sdResult.images[0]}`,
		// 	})
		// }

		// ============================================
		// 方案 2: 调用 Replicate API（云端）
		// ============================================
		// const replicatePayload = buildReplicatePayload(imageBase64, stylePrompt)
		// const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
		// 	method: 'POST',
		// 	headers: {
		// 		'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
		// 		'Content-Type': 'application/json',
		// 	},
		// 	body: JSON.stringify(replicatePayload),
		// })
		// ... 处理响应

		// ============================================
		// 当前：模拟生成（Demo 模式）
		// ============================================
		// 模拟 AI 处理延迟
		await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000))

		// 返回处理后的图片（实际应用中这里会返回 AI 生成的图片）
		// 这里我们添加一个漫画风格的 CSS 滤镜效果作为占位演示
		// 实际接入 API 后，返回的是 AI 生成的真实漫画风格图片
		return NextResponse.json({
			success: true,
			frameId,
			// 返回原图（实际应用中替换为 AI 生成的图片）
			generatedImage: imageBase64,
			// 添加标记表示这是模拟数据
			// @ts-ignore
			isSimulated: true,
		})
	} catch (error) {
		console.error('Generate manga error:', error)
		return NextResponse.json({
			success: false,
			frameId: '',
			error: '生成失败，请稍后重试',
		}, { status: 500 })
	}
}
