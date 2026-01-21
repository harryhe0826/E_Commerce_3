import { NextRequest, NextResponse } from 'next/server'

interface ModelsRequest {
	baseUrl: string
	apiKey: string
}

export async function POST(request: NextRequest) {
	try {
		const body: ModelsRequest = await request.json()
		const { baseUrl, apiKey } = body

		if (!baseUrl || !apiKey) {
			return NextResponse.json(
				{ success: false, error: '缺少 baseUrl 或 apiKey' },
				{ status: 400 }
			)
		}

		const url = `${baseUrl.replace(/\/$/, '')}/models`
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
		})

		if (!response.ok) {
			const errorText = await response.text()
			return NextResponse.json(
				{ success: false, error: `获取模型列表失败: ${response.status} ${errorText}` },
				{ status: response.status }
			)
		}

		const data = await response.json()
		const models = Array.isArray(data?.data)
			? data.data.map((item: { id?: string }) => item.id).filter(Boolean)
			: []

		return NextResponse.json({ success: true, models })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error instanceof Error ? error.message : '获取模型列表失败' },
			{ status: 500 }
		)
	}
}
