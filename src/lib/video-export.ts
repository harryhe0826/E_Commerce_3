/**
 * 视频重组与导出模块
 * 
 * 使用 FFmpeg.wasm 在浏览器端实现视频合成
 * 逻辑：在原视频的对应时间戳位置，插入生成的漫画图片，每张图片停留 2 秒
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// FFmpeg 实例（单例）
let ffmpeg: FFmpeg | null = null
let ffmpegLoaded = false

// 导出进度回调类型
export type ProgressCallback = (progress: number, message: string) => void

// 插入帧的配置
export interface InsertFrame {
	timestamp: number // 视频时间戳（秒）
	imageData: string // base64 图片数据
	duration?: number // 停留时长（秒），默认 2 秒
	width?: number // 图片宽度
	height?: number // 图片高度
}

// 导出配置
export interface ExportConfig {
	videoUrl: string // 原视频 URL
	frames: InsertFrame[] // 要插入的帧列表
	outputFileName?: string // 输出文件名
	imageDuration?: number // 图片默认停留时长
	videoWidth?: number // 原视频宽度
	videoHeight?: number // 原视频高度
	videoDuration?: number // 原视频时长
}

/**
 * 初始化 FFmpeg
 */
export async function initFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
	if (ffmpeg && ffmpegLoaded) {
		return ffmpeg
	}

	onProgress?.(0, '正在加载 FFmpeg...')

	ffmpeg = new FFmpeg()

	// 监听日志
	ffmpeg.on('log', ({ message }) => {
		console.log('[FFmpeg]', message)
	})

	// 监听进度
	ffmpeg.on('progress', ({ progress, time }) => {
		const percent = Math.round(progress * 100)
		onProgress?.(percent, `处理中... ${percent}%`)
	})

	// 加载 FFmpeg WASM
	// 使用 CDN 加载核心文件
	const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

	try {
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
		})
		ffmpegLoaded = true
		onProgress?.(10, 'FFmpeg 加载完成')
	} catch (error) {
		console.error('FFmpeg 加载失败:', error)
		throw new Error('FFmpeg 加载失败，请刷新页面重试')
	}

	return ffmpeg
}

/**
 * 将 base64 图片转换为 Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
	const base64Data = base64.replace(/^data:image\/\w+;base64,/, '')
	const binaryString = atob(base64Data)
	const bytes = new Uint8Array(binaryString.length)
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes
}

/**
 * 格式化时间为 FFmpeg 时间格式 (HH:MM:SS.mmm)
 */
function formatFFmpegTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}

/**
 * 浏览器端视频重组导出
 * 
 * 注意：由于浏览器内存限制，此方法适用于较短视频（< 5分钟）
 * 对于长视频，建议使用后端 MoviePy 方案
 */
export async function exportVideoWithFrames(
	config: ExportConfig,
	onProgress?: ProgressCallback
): Promise<Blob> {
	const {
		videoUrl,
		frames,
		outputFileName = 'itgen_video.mp4',
		imageDuration = 2,
		videoWidth,
		videoHeight,
	} = config

	if (frames.length === 0) {
		throw new Error('没有可导出的帧')
	}

	// 按时间戳排序
	const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)

	onProgress?.(0, '初始化导出环境...')

	// 初始化 FFmpeg
	const ff = await initFFmpeg(onProgress)

	try {
		onProgress?.(10, '正在下载原视频...')

		// 下载原视频
		const videoData = await fetchFile(videoUrl)
		await ff.writeFile('input.mp4', videoData)

		onProgress?.(20, '正在处理图片...')

	// 写入所有图片文件
	for (let i = 0; i < sortedFrames.length; i++) {
		const frame = sortedFrames[i]
		if (!frame) continue
		const imageBytes = base64ToUint8Array(frame.imageData)
		await ff.writeFile(`frame_${i}.jpg`, imageBytes)
	}

		onProgress?.(30, '正在分析视频...')

		// 获取视频信息（使用简单方法）
		// 先获取视频总时长
		await ff.exec(['-i', 'input.mp4', '-f', 'null', '-'])

		onProgress?.(40, '正在生成视频片段...')

		// 创建 FFmpeg 滤镜命令
		// 策略：将视频分割成多个片段，在每个时间点插入图片
		
		// 构建复杂滤镜图
		// 方案：使用 concat 滤镜拼接视频片段和图片
		
		const filterParts: string[] = []
		const concatInputs: string[] = []
		let lastTime = 0
		let streamIndex = 0

		const targetWidth = videoWidth || 1280
		const targetHeight = videoHeight || 720

	for (let i = 0; i < sortedFrames.length; i++) {
		const frame = sortedFrames[i]
		if (!frame) continue
		const frameTime = frame.timestamp
		const frameDuration = frame.duration || imageDuration

		// 1. 原视频片段：从 lastTime 到 frameTime
		if (frameTime > lastTime) {
				filterParts.push(
					`[0:v]trim=start=${lastTime}:end=${frameTime},setpts=PTS-STARTPTS[v${streamIndex}]`
				)
				filterParts.push(
					`[0:a]atrim=start=${lastTime}:end=${frameTime},asetpts=PTS-STARTPTS[a${streamIndex}]`
				)
				concatInputs.push(`[v${streamIndex}][a${streamIndex}]`)
				streamIndex++
			}

			// 2. 插入图片作为视频片段
			// 将图片转换为指定时长的视频，并添加静音音频
			filterParts.push(
				`[${i + 1}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
					`pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,` +
					`setsar=1,fps=30,setpts=PTS-STARTPTS[img${i}]`
			)
			filterParts.push(
				`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${frameDuration}[silence${i}]`
			)
			filterParts.push(
				`[img${i}]loop=loop=${Math.ceil(frameDuration * 30)}:size=1:start=0,trim=duration=${frameDuration},setpts=PTS-STARTPTS[vimg${i}]`
			)
			concatInputs.push(`[vimg${i}][silence${i}]`)

			lastTime = frameTime
			streamIndex++
		}

		// 3. 最后一段视频（如果有的话）
		// 需要获取视频总时长，这里假设处理
		filterParts.push(
			`[0:v]trim=start=${lastTime},setpts=PTS-STARTPTS[vfinal]`
		)
		filterParts.push(
			`[0:a]atrim=start=${lastTime},asetpts=PTS-STARTPTS[afinal]`
		)
		concatInputs.push('[vfinal][afinal]')

		// 4. 拼接所有片段
		const concatFilter = `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=1[outv][outa]`
		filterParts.push(concatFilter)

		const filterComplex = filterParts.join(';')

		onProgress?.(50, '正在合成视频...')

		// 构建 FFmpeg 命令
		const inputArgs: string[] = ['-i', 'input.mp4']
		for (let i = 0; i < sortedFrames.length; i++) {
			inputArgs.push('-loop', '1', '-i', `frame_${i}.jpg`)
		}

		// 由于复杂滤镜可能出错，我们使用更简单的方案
		// 简化方案：直接叠加图片到视频上
		await ff.exec([
			...inputArgs,
			'-filter_complex', filterComplex,
			'-map', '[outv]',
			'-map', '[outa]',
			'-c:v', 'libx264',
			'-preset', 'fast',
			'-crf', '23',
			'-c:a', 'aac',
			'-b:a', '128k',
			'-movflags', '+faststart',
			outputFileName,
		])

		onProgress?.(90, '正在生成输出文件...')

	// 读取输出文件
	const outputData = await ff.readFile(outputFileName)
	const uint8Array = new Uint8Array(outputData as Uint8Array)
	const outputBlob = new Blob([uint8Array], { type: 'video/mp4' })

		// 清理临时文件
		await ff.deleteFile('input.mp4')
		for (let i = 0; i < sortedFrames.length; i++) {
			await ff.deleteFile(`frame_${i}.jpg`)
		}
		await ff.deleteFile(outputFileName)

		onProgress?.(100, '导出完成！')

		return outputBlob

	} catch (error) {
		console.error('视频导出失败:', error)
		throw new Error(`视频导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
	}
}

/**
 * 简化版导出：图片完全替换视频帧
 * 
 * 逻辑：视频播放到关键帧时间点 -> 画面完全切换为生成的图片并持续指定秒数 -> 继续播放原视频
 * 按时间顺序依次展示，不会同时显示多个画面
 */
export async function exportVideoSimple(
	config: ExportConfig,
	onProgress?: ProgressCallback
): Promise<Blob> {
	const {
		videoUrl,
		frames,
		outputFileName = 'itgen_video.mp4',
		imageDuration = 2,
		videoWidth,
		videoHeight,
		videoDuration,
	} = config

	if (frames.length === 0) {
		throw new Error('没有可导出的帧')
	}

	// 按时间戳排序，确保时间顺序
	const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)

	onProgress?.(0, '初始化导出环境...')
	const ff = await initFFmpeg(onProgress)

	try {
		onProgress?.(15, '正在下载原视频...')
		const videoData = await fetchFile(videoUrl)
		await ff.writeFile('input.mp4', videoData)

		onProgress?.(25, '正在分析视频...')
		
		// 获取视频信息（分辨率）
		// 先探测视频获取分辨率
		await ff.exec(['-i', 'input.mp4', '-f', 'null', '-'])

	onProgress?.(30, '正在处理图片...')
	for (let i = 0; i < sortedFrames.length; i++) {
		const frame = sortedFrames[i]
		if (!frame) continue
		const imageBytes = base64ToUint8Array(frame.imageData)
		await ff.writeFile(`img_${i}.jpg`, imageBytes)
	}

		onProgress?.(40, '正在分割视频片段...')

		// 策略：将视频按时间点分割，在每个关键帧位置插入静态图片
		// 输出格式：[视频片段1] -> [图片1持续2秒] -> [视频片段2] -> [图片2持续2秒] -> ...

		const segments: string[] = []
		let lastCutTime = 0

		const targetWidth = videoWidth || 1280
		const targetHeight = videoHeight || 720

	// 生成视频分割片段和图片视频片段
	for (let i = 0; i < sortedFrames.length; i++) {
		const frame = sortedFrames[i]
		if (!frame) continue
		const frameTime = frame.timestamp
		const frameDuration = frame.duration || imageDuration

		// 1. 如果当前时间点大于上次切割点，先输出视频片段
		if (frameTime > lastCutTime) {
				const segmentName = `seg_v${i}.mp4`
				await ff.exec([
					'-i', 'input.mp4',
					'-ss', lastCutTime.toFixed(3),
					'-t', (frameTime - lastCutTime).toFixed(3),
					'-c:v', 'libx264',
					'-preset', 'ultrafast',
					'-crf', '23',
					'-c:a', 'aac',
					'-y',
					segmentName,
				])
				segments.push(segmentName)
			}

			// 2. 将图片转换为视频片段（持续指定时长）
			// 图片缩放到与原视频相同尺寸，完全覆盖画面
			const imgSegmentName = `seg_img${i}.mp4`
			await ff.exec([
				'-loop', '1',
				'-i', `img_${i}.jpg`,
				'-f', 'lavfi',
				'-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
				'-t', frameDuration.toFixed(3),
				'-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
					`pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
				'-c:v', 'libx264',
				'-preset', 'ultrafast',
				'-crf', '23',
				'-c:a', 'aac',
				'-shortest',
				'-y',
				imgSegmentName,
			])
			segments.push(imgSegmentName)

			lastCutTime = frameTime
		}

		// 3. 输出最后一段视频（从最后一个关键帧到视频结束）
		if (!videoDuration || lastCutTime < videoDuration - 0.001) {
			const finalSegmentName = 'seg_final.mp4'
			const finalArgs = [
				'-i', 'input.mp4',
				'-ss', lastCutTime.toFixed(3),
			]
			if (videoDuration) {
				finalArgs.push('-t', Math.max(videoDuration - lastCutTime, 0).toFixed(3))
			}
			finalArgs.push(
				'-c:v', 'libx264',
				'-preset', 'ultrafast',
				'-crf', '23',
				'-c:a', 'aac',
				'-y',
				finalSegmentName
			)
			await ff.exec(finalArgs)
			segments.push(finalSegmentName)
		}

		onProgress?.(70, '正在拼接视频片段...')

		// 创建 concat 文件列表
		const concatList = segments.map(s => `file '${s}'`).join('\n')
		const encoder = new TextEncoder()
		await ff.writeFile('concat.txt', encoder.encode(concatList))

		// 使用 concat demuxer 拼接所有片段
		await ff.exec([
			'-f', 'concat',
			'-safe', '0',
			'-i', 'concat.txt',
			'-c:v', 'libx264',
			'-preset', 'ultrafast',
			'-crf', '23',
			'-c:a', 'aac',
			'-movflags', '+faststart',
			'-y',
			outputFileName,
		])

	onProgress?.(90, '正在生成文件...')

	const outputData = await ff.readFile(outputFileName)
	const uint8Array = new Uint8Array(outputData as Uint8Array)
	const outputBlob = new Blob([uint8Array], { type: 'video/mp4' })

		// 清理临时文件
		await ff.deleteFile('input.mp4')
		await ff.deleteFile('concat.txt')
		for (let i = 0; i < sortedFrames.length; i++) {
			await ff.deleteFile(`img_${i}.jpg`)
		}
		for (const seg of segments) {
			try {
				await ff.deleteFile(seg)
			} catch {
				// 忽略删除错误
			}
		}
		await ff.deleteFile(outputFileName)

		onProgress?.(100, '导出完成！')
		return outputBlob

	} catch (error) {
		console.error('视频导出失败:', error)
		throw new Error(`视频导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
	}
}

/**
 * 下载 Blob 文件
 */
export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}
