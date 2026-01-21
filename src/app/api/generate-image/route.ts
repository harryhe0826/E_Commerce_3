import { NextRequest, NextResponse } from 'next/server'

/**
 * 图像生成 API
 * 
 * 支持：
 * 1. 使用 LLM 增强 Prompt（可选）
 * 2. 调用图像生成模型（Gemini / DALL-E 3 / Stable Diffusion）
 * 3. 支持自定义 Base URL（聚合平台）
 * 4. Gemini 图生图模型：严格保持原图内容，仅转换风格
 */

interface GenerateImageRequest {
	// API 配置（统一）
	baseUrl: string
	apiKey: string
	model: string

	// 生成参数
	originalPrompt: string // 用户输入的风格描述
	sourceImageBase64?: string // 原始图片（用于 Img2Img）
	sourceWidth?: number // 原图宽度
	sourceHeight?: number // 原图高度

	// 可选：跳过 prompt 增强
	skipEnhancement?: boolean
	// 严格保持原图内容（用于漫画线稿转换）
	preserveContent?: boolean
}

interface GenerateImageResponse {
	success: boolean
	imageUrl?: string // 生成的图片 URL
	imageBase64?: string // 生成的图片 Base64
	enhancedPrompt?: string // 增强后的 Prompt
	error?: string
}

/**
 * 使用 LLM 增强 Prompt
 */
async function enhancePrompt(
	baseUrl: string,
	apiKey: string,
	model: string,
	originalPrompt: string,
	hasSourceImage: boolean,
	preserveContent: boolean = false
): Promise<string> {
	// 如果是严格保持内容模式（漫画线稿），使用特殊的 Prompt
	const systemPrompt = preserveContent 
		? `你是一个专业的漫画线稿转换 Prompt 工程师。你的任务是生成一个能够将照片转换为漫画线稿的 Prompt。

【核心要求 - 必须严格遵守】
1. 必须 100% 保持原图的构图、布局、所有元素位置
2. 仅将画面转换为漫画/线稿风格
3. 禁止添加、删除或移动任何画面元素
4. 禁止改变人物或物体的姿态、位置、比例
5. 输出尺寸必须与原图完全一致

【风格转换要求】
- 转换为黑白或简约色彩的漫画线稿
- 保持清晰的轮廓线条
- 适当简化细节但保持可识别性

输出纯英文 Prompt，不要有任何解释。Prompt 需要强调 "exact same composition, same layout, same positions, only style change to manga/line art".`
		: `你是一个专业的 AI 图像生成 Prompt 工程师。你的任务是将用户的简短描述转换为高质量的图像生成 Prompt。

要求：
1. 保持用户描述的核心风格和意图
2. 添加细节描述：光影、色彩、构图、材质等
3. 添加画质标签：high quality, detailed, masterpiece 等
4. ${hasSourceImage ? '这是一个 Img2Img 任务，需要保持原图的构图和主体内容，仅改变艺术风格' : '这是一个全新生成任务'}
5. 输出纯英文 Prompt，不要有解释
6. Prompt 长度控制在 100-200 词

直接输出优化后的 Prompt，不要有任何前缀或解释。`

	// 对于 Gemini 图像模型，使用 /gemini 端点进行 LLM 调用
	let llmBaseUrl = baseUrl.replace(/\/$/, '')
	let llmModel = model

	// 如果是 Gemini 图像模型，也用它来增强 Prompt（Gemini 支持多模态）
	if (model.includes('gemini')) {
		if (llmBaseUrl.endsWith('/v1')) {
			llmBaseUrl = llmBaseUrl.replace('/v1', '/gemini')
		} else if (!llmBaseUrl.endsWith('/gemini')) {
			llmBaseUrl = llmBaseUrl + '/gemini'
		}
		// 使用 generateContent API
		const requestBody = {
			contents: [
				{
					role: 'user',
					parts: [{ text: `${systemPrompt}\n\n请优化以下图像生成描述：\n\n${originalPrompt}` }],
				},
			],
			generationConfig: {
				temperature: 0.5,
				maxOutputTokens: 500,
			},
		}

		const response = await fetch(`${llmBaseUrl}/v1beta/models/${llmModel}:generateContent?key=${apiKey}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`LLM 请求失败: ${response.status} - ${error}`)
		}

		const data = await response.json()
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text
		return text?.trim() || originalPrompt
	}

	// 非 Gemini 模型使用 OpenAI 兼容格式
	const response = await fetch(`${llmBaseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: llmModel,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: `请优化以下图像生成描述：\n\n${originalPrompt}` },
			],
			temperature: 0.5,
			max_tokens: 500,
		}),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error?.message || `LLM 请求失败: ${response.status}`)
	}

	const data = await response.json()
	return data.choices[0]?.message?.content?.trim() || originalPrompt
}

/**
 * 调用 DALL-E 生成图片
 */
async function generateWithDallE(
	baseUrl: string,
	apiKey: string,
	model: string,
	prompt: string,
	size: string = '1024x1792' // 9:16
): Promise<{ url?: string; b64_json?: string }> {
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/images/generations`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			prompt,
			n: 1,
			size,
			quality: 'standard',
			response_format: 'b64_json',
		}),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error?.message || `图像生成失败: ${response.status}`)
	}

	const data = await response.json()
	return {
		url: data.data[0]?.url,
		b64_json: data.data[0]?.b64_json,
	}
}

/**
 * 调用 Gemini 图生图 API（Google Gemini 原生 API 格式）
 * 
 * 模型：gemini-2.5-flash-image / gemini-2.5-pro-image
 * 使用 /gemini 端点，通过 generateContent API 调用
 */
async function generateWithGemini(
	baseUrl: string,
	apiKey: string,
	model: string,
	prompt: string,
	sourceImageBase64?: string
): Promise<{ b64_json?: string }> {
	// 构建增强的 Prompt
	const enhancedPrompt = sourceImageBase64 
		? `Based on this image, transform it to: ${prompt}. CRITICAL: maintain exact same composition, layout, element positions. Only change artistic style to manga/line art with bold outlines.`
		: `generate image: ${prompt}, bold outline, in the style of manga/line art, HD`

	// 构建请求内容
	const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []

	// 如果有源图，先添加图片
	if (sourceImageBase64) {
		const matches = sourceImageBase64.match(/^data:([^;]+);base64,(.+)$/)
		if (matches && matches[1] && matches[2]) {
			parts.push({
				inline_data: {
					mime_type: matches[1],
					data: matches[2],
				},
			})
		}
	}

	// 添加文本 prompt
	parts.push({ text: enhancedPrompt })

	// 构建 Gemini API 请求体
	const requestBody = {
		contents: [
			{
				role: 'user',
				parts,
			},
		],
		generationConfig: {
			responseModalities: ['IMAGE', 'TEXT'],
			imageConfig: {
				aspectRatio: '9:16',
			},
		},
	}

	// 构建 Gemini API URL
	// AIHubMix 的 Gemini 端点格式: https://aihubmix.com/gemini/v1beta/models/{model}:generateContent
	let geminiBaseUrl = baseUrl.replace(/\/$/, '')
	if (geminiBaseUrl.endsWith('/v1')) {
		geminiBaseUrl = geminiBaseUrl.replace('/v1', '/gemini')
	} else if (!geminiBaseUrl.endsWith('/gemini')) {
		geminiBaseUrl = geminiBaseUrl + '/gemini'
	}

	const apiUrl = `${geminiBaseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`

	console.log('Gemini API URL:', apiUrl.replace(apiKey, 'API_KEY_HIDDEN'))

	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	})

	if (!response.ok) {
		const errorText = await response.text()
		console.error('Gemini API 错误:', errorText)
		let errorMessage = `Gemini 图像生成失败: ${response.status}`
		try {
			const errorJson = JSON.parse(errorText)
			errorMessage = errorJson.error?.message || errorMessage
		} catch {
			// 忽略解析错误
		}
		throw new Error(errorMessage)
	}

	const data = await response.json()

	// 从响应中提取图像
	const candidates = data.candidates
	if (!candidates || candidates.length === 0) {
		throw new Error('Gemini 返回数据中没有候选结果')
	}

	const content = candidates[0]?.content
	if (!content || !content.parts) {
		throw new Error('Gemini 返回数据中没有内容')
	}

	// 遍历 parts 查找图像数据
	for (const part of content.parts) {
		const inlineData = part.inline_data || part.inlineData
		if (inlineData && inlineData.data) {
			console.log('找到图像数据，mime_type:', inlineData.mime_type)
			return { b64_json: inlineData.data }
		}
		if (part.text) {
			console.log('Gemini 文本响应:', part.text)
		}
	}

	throw new Error('Gemini 返回数据中未找到图像，请检查模型是否支持图像生成')
}

/**
 * 调用 Stable Diffusion API（通过聚合平台）
 */
async function generateWithStableDiffusion(
	baseUrl: string,
	apiKey: string,
	model: string,
	prompt: string,
	sourceImageBase64?: string,
	preserveContent: boolean = false
): Promise<{ b64_json?: string }> {
	const endpoint = '/images/generations'

	// 强制 9:16 比例
	const outputWidth = 576
	const outputHeight = 1024

	const body: Record<string, unknown> = {
		model,
		prompt: `${prompt}, 9:16 aspect ratio, portrait orientation`,
		n: 1,
		size: `${outputWidth}x${outputHeight}`,
		response_format: 'b64_json',
	}

	if (sourceImageBase64) {
		body.init_image = sourceImageBase64.replace(/^data:image\/\w+;base64,/, '')
		body.strength = preserveContent ? 0.2 : 0.35
		if (preserveContent) {
			body.control_mode = 'canny'
			body.control_strength = 0.9
		}
	}

	const response = await fetch(`${baseUrl.replace(/\/$/, '')}${endpoint}`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	})

	if (!response.ok) {
		const error = await response.json().catch(() => ({}))
		throw new Error(error.error?.message || `SD 图像生成失败: ${response.status}`)
	}

	const data = await response.json()
	return {
		b64_json: data.data?.[0]?.b64_json || data.images?.[0],
	}
}

export async function POST(
	request: NextRequest
): Promise<NextResponse<GenerateImageResponse>> {
	try {
		const body: GenerateImageRequest = await request.json()

		const {
			baseUrl,
			apiKey,
			model,
			originalPrompt,
			sourceImageBase64,
			skipEnhancement = false,
			preserveContent = false,
		} = body

		// 验证必要参数
		if (!apiKey) {
			return NextResponse.json({
				success: false,
				error: '请先在设置中配置 API Key',
			})
		}

		if (!originalPrompt) {
			return NextResponse.json({
				success: false,
				error: '请提供图像描述',
			})
		}

		let enhancedPrompt = originalPrompt

		// 1. 使用同一模型增强 Prompt（如果未跳过）
		if (!skipEnhancement && apiKey && baseUrl) {
			try {
				enhancedPrompt = await enhancePrompt(
					baseUrl,
					apiKey,
					model,
					originalPrompt,
					!!sourceImageBase64,
					preserveContent
				)
			} catch (error) {
				console.warn('Prompt 增强失败，使用原始 Prompt:', error)
			}
		}

		// 如果是严格保持内容模式，添加强制性 Prompt 后缀
		if (preserveContent && sourceImageBase64) {
			enhancedPrompt = `${enhancedPrompt}, CRITICAL: maintain exact same composition and layout as source image, same positions of all elements, only change to manga/line art style, do not add or remove any elements`
		}

		// 2. 根据模型类型调用不同的生成接口
		let result: { url?: string; b64_json?: string }

		if (model.includes('gemini')) {
			// Gemini 图生图模型（推荐）
			result = await generateWithGemini(
				baseUrl,
				apiKey,
				model,
				enhancedPrompt,
				sourceImageBase64
			)
		} else if (model.includes('dall-e')) {
			// DALL-E 模型
			result = await generateWithDallE(baseUrl, apiKey, model, enhancedPrompt, '1024x1792')
		} else {
			// Stable Diffusion 或其他模型
			result = await generateWithStableDiffusion(
				baseUrl,
				apiKey,
				model,
				enhancedPrompt,
				sourceImageBase64,
				preserveContent
			)
		}

		// 3. 返回结果
		return NextResponse.json({
			success: true,
			imageUrl: result.url,
			imageBase64: result.b64_json ? `data:image/png;base64,${result.b64_json}` : undefined,
			enhancedPrompt,
		})
	} catch (error) {
		console.error('图像生成错误:', error)
		return NextResponse.json({
			success: false,
			error: error instanceof Error ? error.message : '图像生成失败',
		})
	}
}
