import { NextRequest, NextResponse } from 'next/server'

/**
 * 视频解析 API 占位
 * 
 * 未来可接入第三方解析服务来解析抖音/小红书链接
 * 当前仅作为占位，返回模拟数据
 */
export async function POST(request: NextRequest) {
	try {
		const { url } = await request.json()

		if (!url) {
			return NextResponse.json(
				{ error: '请提供视频链接' },
				{ status: 400 }
			)
		}

		// 检查是否为直接的 mp4 链接
		if (url.endsWith('.mp4') || url.includes('.mp4')) {
			return NextResponse.json({
				success: true,
				videoUrl: url,
				title: '直接视频链接',
				source: 'direct',
			})
		}

		// 检查是否为抖音链接
		if (url.includes('douyin')) {
			// TODO: 接入抖音解析服务
			return NextResponse.json({
				success: false,
				error: '抖音解析功能开发中，请直接使用 .mp4 链接测试',
				placeholder: true,
			})
		}

		// 检查是否为小红书链接
		if (url.includes('xiaohongshu') || url.includes('xhslink')) {
			// TODO: 接入小红书解析服务
			return NextResponse.json({
				success: false,
				error: '小红书解析功能开发中，请直接使用 .mp4 链接测试',
				placeholder: true,
			})
		}

		return NextResponse.json(
			{ error: '不支持的链接格式，请输入抖音、小红书链接或直接的 .mp4 地址' },
			{ status: 400 }
		)
	} catch (error) {
		return NextResponse.json(
			{ error: '解析失败，请稍后重试' },
			{ status: 500 }
		)
	}
}
