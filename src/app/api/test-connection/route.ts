import { NextRequest, NextResponse } from 'next/server'

/**
 * 测试 API 连接
 * 发送一个简单请求验证 API Key 是否有效
 */

interface TestRequest {
	baseUrl: string
	apiKey: string
	model: string
}

export async function POST(request: NextRequest) {
	try {
		const body: TestRequest = await request.json()
		const { baseUrl, apiKey, model } = body

		if (!baseUrl || !apiKey) {
			return NextResponse.json(
				{ success: false, error: '缺少必要参数' },
				{ status: 400 }
			)
		}

		// 发送测试请求（列出模型）
		const testUrl = `${baseUrl.replace(/\/$/, '')}/models`
		
		const response = await fetch(testUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
		})

		if (response.ok) {
			const data = await response.json()
			return NextResponse.json({
				success: true,
				message: '连接成功',
				availableModels: data.data?.slice(0, 5).map((m: { id: string }) => m.id) || [],
			})
		}

		// 如果列出模型失败，尝试发送一个简单的 chat completion 请求
		const chatResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: model || 'gpt-3.5-turbo',
				messages: [{ role: 'user', content: 'Hi' }],
				max_tokens: 5,
			}),
		})

		if (chatResponse.ok) {
			return NextResponse.json({
				success: true,
				message: '连接成功',
			})
		}

		const errorData = await chatResponse.json().catch(() => ({}))
		return NextResponse.json({
			success: false,
			error: errorData.error?.message || `HTTP ${chatResponse.status}`,
		})
	} catch (error) {
		return NextResponse.json({
			success: false,
			error: error instanceof Error ? error.message : '连接失败',
		})
	}
}
