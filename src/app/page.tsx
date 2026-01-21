'use client'

import { SettingsModal } from '@/components/settings-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
	downloadBlob,
	exportVideoSimple,
	type InsertFrame,
} from '@/lib/video-export'
import { useSettingsStore } from '@/store/settings'
import {
	AlertCircle,
	Check,
	Download,
	Film,
	Image as ImageIcon,
	Loader2,
	Pause,
	Play,
	RefreshCw,
	Settings,
	ShoppingBag,
	Sparkles,
	Trash2,
	Upload,
	Video,
	Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// 生成状态枚举
type GenerationStatus = 'idle' | 'generating' | 'completed' | 'error'

// 导出状态枚举
type ExportStatus = 'idle' | 'exporting' | 'completed' | 'error'

// 定义捕获帧的类型
interface CapturedFrame {
	id: string
	imageData: string // 原始 base64 图片数据
	timestamp: number // 视频时间戳（秒）
	capturedAt: Date // 捕获时间
	width: number // 原始图片宽度
	height: number // 原始图片高度
	// AI 生成相关
	generatedImage?: string // AI 生成的风格化图片
	generationStatus: GenerationStatus // 生成状态
	generationError?: string // 错误信息
}

export default function ITGenPage() {
	const [videoUrl, setVideoUrl] = useState('')
	const [videoFile, setVideoFile] = useState<File | null>(null)
	const [promptText, setPromptText] = useState('')
	const [isPlaying, setIsPlaying] = useState(false)
	const [progress, setProgress] = useState(0)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([])
	const [isGeneratingAll, setIsGeneratingAll] = useState(false)

	// 导出相关状态
	const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
	const [exportMessage, setExportMessage] = useState('')
	const [imageDuration, setImageDuration] = useState(2) // 每张图片停留时间（秒）
	const [videoSize, setVideoSize] = useState<{ width: number; height: number }>({
		width: 1280,
		height: 720,
	})

	// API 设置
	const { settings, openSettings, getConfig } = useSettingsStore()

	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	// 格式化时间显示
	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	// 处理视频文件上传
	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// 检查文件类型
		if (!file.type.startsWith('video/')) {
			toast.error('请上传视频文件')
			return
		}

		// 检查文件大小（限制 500MB）
		const maxSize = 500 * 1024 * 1024
		if (file.size > maxSize) {
			toast.error('视频文件不能超过 500MB')
			return
		}

		setVideoFile(file)
		const url = URL.createObjectURL(file)
		setVideoUrl(url)
		setCapturedFrames([]) // 清空之前捕获的帧
		toast.success(`视频 "${file.name}" 加载成功！`)
	}

	// 触发文件选择
	const triggerFileSelect = () => {
		fileInputRef.current?.click()
	}

	// 清除视频
	const clearVideo = () => {
		if (videoUrl) {
			URL.revokeObjectURL(videoUrl)
		}
		setVideoUrl('')
		setVideoFile(null)
		setCapturedFrames([])
		setCurrentTime(0)
		setDuration(0)
		toast.success('视频已清除')
	}

	// 捕获当前视频帧
	const captureFrame = useCallback(() => {
		const video = videoRef.current
		const canvas = canvasRef.current

		if (!video || !canvas || !videoUrl) {
			toast.error('请先加载视频')
			return
		}

		if (capturedFrames.length >= 10) {
			toast.error('最多只能捕获10个定格画面')
			return
		}

		const ctx = canvas.getContext('2d')
		if (!ctx) return

		canvas.width = video.videoWidth
		canvas.height = video.videoHeight
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

		const imageData = canvas.toDataURL('image/jpeg', 0.8)

		const newFrame: CapturedFrame = {
			id: `frame-${Date.now()}`,
			imageData,
			timestamp: video.currentTime,
			capturedAt: new Date(),
			width: video.videoWidth,
			height: video.videoHeight,
			generationStatus: 'idle',
		}

		setCapturedFrames((prev) => [...prev, newFrame])
		toast.success(`画面已捕获 (${formatTime(video.currentTime)})`)
	}, [videoUrl, capturedFrames.length])

	// 删除捕获的画面
	const handleDeleteFrame = (id: string) => {
		setCapturedFrames((prev) => prev.filter((frame) => frame.id !== id))
		toast.success('已删除')
	}

	// 跳转到指定时间
	const seekToTime = (timestamp: number) => {
		if (videoRef.current) {
			videoRef.current.currentTime = timestamp
		}
	}

	// 播放/暂停切换
	const togglePlay = () => {
		if (videoRef.current) {
			if (isPlaying) {
				videoRef.current.pause()
			} else {
				videoRef.current.play()
			}
		}
	}

	// 生成单个帧的 AI 风格
	const generateMangaForFrame = async (frameId: string) => {
		if (!promptText.trim()) {
			toast.error('请先输入风格描述')
			return
		}

		// 检查 API 配置
		const config = getConfig()

		if (!config.apiKey) {
			toast.error('请先在设置中配置 API Key')
			openSettings()
			return
		}

		const frame = capturedFrames.find((f) => f.id === frameId)
		if (!frame) return

		setCapturedFrames((prev) =>
			prev.map((f) =>
				f.id === frameId ? { ...f, generationStatus: 'generating' as GenerationStatus } : f
			)
		)

		try {
			// 构建强调严格还原的 Prompt
			const enhancedPrompt = `${promptText}

【重要要求】必须 100% 严格还原原图的构图、布局、人物位置、物体位置，仅转换为漫画线稿风格。禁止改变任何内容元素的位置或比例。`

			// 调用 generate-image API（统一使用一个模型）
			const response = await fetch('/api/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					// 统一的 API 配置
					baseUrl: config.baseUrl,
					apiKey: config.apiKey,
					model: config.model,
					// 生成参数
					originalPrompt: enhancedPrompt,
					sourceImageBase64: frame.imageData,
					// 传递原图尺寸，确保生成图片与原图一致
					sourceWidth: frame.width,
					sourceHeight: frame.height,
					// 使用 img2img 模式，严格保持原图内容
					preserveContent: true,
				}),
			})

			const data = await response.json()

			if (data.success && (data.imageBase64 || data.imageUrl)) {
				setCapturedFrames((prev) =>
					prev.map((f) =>
						f.id === frameId
							? {
									...f,
									generatedImage: data.imageBase64 || data.imageUrl,
									generationStatus: 'completed' as GenerationStatus,
								}
							: f
					)
				)
				toast.success('AI 风格生成完成！')
			} else {
				throw new Error(data.error || '生成失败')
			}
		} catch (error) {
			setCapturedFrames((prev) =>
				prev.map((f) =>
					f.id === frameId
						? {
								...f,
								generationStatus: 'error' as GenerationStatus,
								generationError: error instanceof Error ? error.message : '生成失败',
							}
						: f
				)
			)
			toast.error(`生成失败: ${error instanceof Error ? error.message : '请重试'}`)
		}
	}

	// 批量生成所有帧的 AI 风格
	const generateMangaForAllFrames = async () => {
		if (!promptText.trim()) {
			toast.error('请先输入风格描述')
			return
		}

		if (capturedFrames.length === 0) {
			toast.error('请先捕获至少一个定格画面')
			return
		}

		setIsGeneratingAll(true)
		const framesToGenerate = capturedFrames.filter(
			(f) => f.generationStatus !== 'completed' && f.generationStatus !== 'generating'
		)

		if (framesToGenerate.length === 0) {
			toast.info('所有画面都已生成完成')
			setIsGeneratingAll(false)
			return
		}

		toast.info(`开始生成 ${framesToGenerate.length} 张 AI 风格图片...`)

		for (const frame of framesToGenerate) {
			await generateMangaForFrame(frame.id)
		}

		setIsGeneratingAll(false)
		toast.success('全部生成完成！')
	}

	// 重置帧的生成状态
	const resetFrameGeneration = (frameId: string) => {
		setCapturedFrames((prev) =>
			prev.map((f) =>
				f.id === frameId
					? {
							...f,
							generatedImage: undefined,
							generationStatus: 'idle' as GenerationStatus,
							generationError: undefined,
						}
					: f
			)
		)
	}

	// 监听空格键捕获帧
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
				return
			}

			if (e.code === 'Space') {
				e.preventDefault()
				captureFrame()
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [captureFrame])

	// 视频事件处理
	const handleTimeUpdate = () => {
		if (videoRef.current) {
			setCurrentTime(videoRef.current.currentTime)
		}
	}

	const handleLoadedMetadata = () => {
		if (videoRef.current) {
			setDuration(videoRef.current.duration)
			if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
				setVideoSize({
					width: videoRef.current.videoWidth,
					height: videoRef.current.videoHeight,
				})
			}
		}
	}

	const handlePlay = () => setIsPlaying(true)
	const handlePause = () => setIsPlaying(false)

	const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!videoRef.current || !duration) return
		const rect = e.currentTarget.getBoundingClientRect()
		const percent = (e.clientX - rect.left) / rect.width
		videoRef.current.currentTime = percent * duration
	}

	// 计算生成统计
	const completedCount = capturedFrames.filter((f) => f.generationStatus === 'completed').length
	const generatingCount = capturedFrames.filter((f) => f.generationStatus === 'generating').length

	// 导出视频功能（使用 FFmpeg.wasm）
	const handleExport = async () => {
		if (completedCount === 0) {
			toast.error('请先生成 AI 风格图片')
			return
		}

		if (!videoUrl) {
			toast.error('请先加载视频')
			return
		}

		// 获取已完成生成的帧
		const completedFrames = capturedFrames.filter(
			(f) => f.generationStatus === 'completed' && f.generatedImage
		)

		if (completedFrames.length === 0) {
			toast.error('没有可导出的 AI 风格帧')
			return
		}

		setExportStatus('exporting')
		setProgress(0)
		setExportMessage('正在准备导出...')

		try {
			// 准备插入帧数据
			const insertFrames: InsertFrame[] = completedFrames.map((frame) => ({
				timestamp: frame.timestamp,
				imageData: frame.generatedImage!,
				duration: imageDuration,
			}))

			toast.info(
				`开始导出视频，将在 ${completedFrames.length} 个时间点插入 AI 生成图片，每张停留 ${imageDuration} 秒`
			)

			// 使用 FFmpeg.wasm 导出
			const outputBlob = await exportVideoSimple(
				{
					videoUrl,
					frames: insertFrames,
					outputFileName: 'mangavibe_output.mp4',
					imageDuration,
					videoWidth: videoSize.width,
					videoHeight: videoSize.height,
					videoDuration: duration,
				},
				(progressValue, message) => {
					setProgress(progressValue)
					setExportMessage(message)
				}
			)

			// 下载文件
			downloadBlob(outputBlob, `ITGen_${Date.now()}.mp4`)

			setExportStatus('completed')
			setExportMessage('导出完成！')
			toast.success('视频导出成功！文件已开始下载')
		} catch (error) {
			console.error('导出失败:', error)
			setExportStatus('error')
			setExportMessage(error instanceof Error ? error.message : '导出失败')
			toast.error(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`)
		}
	}

	// 重置导出状态
	const resetExport = () => {
		setExportStatus('idle')
		setProgress(0)
		setExportMessage('')
	}

	// 计算预计新视频时长
	const estimatedDuration = duration + completedCount * imageDuration

	return (
		<main className="flex min-h-screen flex-col">
			<canvas ref={canvasRef} className="hidden" />

			{/* 设置弹窗 */}
			<SettingsModal />

			{/* 顶部标题和视频上传 */}
			<header className="border-zinc-800 border-b bg-zinc-900/50 px-4 py-4 backdrop-blur-sm">
				<div className="mx-auto max-w-7xl">
					<div className="mb-4 flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
							<ShoppingBag className="h-5 w-5 text-white" />
						</div>
						<h1 className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text font-bold text-2xl text-transparent">
							ITGen E-Commerce
						</h1>
						<span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
							按空格键捕获画面
						</span>
						{/* 设置按钮 */}
						<div className="ml-auto flex items-center gap-2">
							{!settings.apiKey && (
								<span className="text-xs text-amber-400">⚠️ 未配置 API</span>
							)}
							<Button
								variant="ghost"
								size="icon"
								onClick={openSettings}
								className="h-9 w-9 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white"
								title="API 设置"
							>
								<Settings className="h-4 w-4" />
							</Button>
						</div>
					</div>
					{/* 视频上传区域 */}
					<div className="flex items-center gap-3">
						<input
							ref={fileInputRef}
							type="file"
							accept="video/*"
							onChange={handleFileUpload}
							className="hidden"
						/>
						{videoFile ? (
							<>
								<div className="flex flex-1 items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2">
									<Video className="h-5 w-5 text-emerald-400" />
									<div className="flex-1 truncate">
										<p className="truncate text-sm text-zinc-100">{videoFile.name}</p>
										<p className="text-xs text-zinc-500">
											{(videoFile.size / 1024 / 1024).toFixed(2)} MB
										</p>
									</div>
								</div>
								<Button
									variant="outline"
									onClick={clearVideo}
									className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									清除
								</Button>
							</>
						) : (
							<Button
								onClick={triggerFileSelect}
								className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
							>
								<Upload className="mr-2 h-4 w-4" />
								上传视频文件
							</Button>
						)}
					</div>
				</div>
			</header>

			{/* 主体内容区 */}
			<div className="flex flex-1 flex-col lg:flex-row">
				{/* 左侧 Prompt Panel */}
				<aside className="flex w-full flex-col border-zinc-800 border-b bg-zinc-900/30 p-4 lg:w-96 lg:border-r lg:border-b-0">
					<div className="mb-4">
						<h2 className="mb-2 flex items-center gap-2 font-semibold text-sm text-zinc-300">
							<Sparkles className="h-4 w-4 text-violet-400" />
							AI 风格描述 (Style Prompt)
						</h2>
						<Textarea
							className="min-h-32 resize-none border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500"
							placeholder="描述你想要的漫画线稿风格，例如：&#10;黑白漫画线稿风格，清晰轮廓线条，简约背景...&#10;&#10;提示：系统会严格保持原画构图，仅转换为线稿风格"
							value={promptText}
							onChange={(e) => setPromptText(e.target.value)}
						/>
						<p className="mt-2 text-xs text-zinc-500">
							💡 严格保持原画构图，仅转换为漫画线稿风格。输出图片比例为 9:16（竖版）。
						</p>
					</div>

					<Button
						onClick={generateMangaForAllFrames}
						disabled={isGeneratingAll || capturedFrames.length === 0 || !promptText.trim()}
						className="mb-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500"
					>
						{isGeneratingAll ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								生成中 ({generatingCount}/{capturedFrames.length})
							</>
						) : (
							<>
								<Wand2 className="mr-2 h-4 w-4" />
								生成全部 AI 风格
							</>
						)}
					</Button>

					{/* 生成预览列表 */}
					<div className="flex-1 overflow-auto">
						<h3 className="mb-3 flex items-center gap-2 font-semibold text-sm text-zinc-300">
							<ImageIcon className="h-4 w-4 text-fuchsia-400" />
							生成预览 ({completedCount}/{capturedFrames.length})
						</h3>
						<div className="space-y-2">
							{capturedFrames.length === 0 ? (
								<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 py-8 text-center">
									<ImageIcon className="mb-2 h-8 w-8 text-zinc-600" />
									<p className="text-sm text-zinc-500">暂无捕获画面</p>
									<p className="text-xs text-zinc-600">先捕获画面，再生成 AI 风格</p>
								</div>
							) : (
								capturedFrames.map((frame, index) => (
									<div
										key={frame.id}
										className="group relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/50"
									>
										<div className="flex">
											<div className="relative w-1/2 border-zinc-700 border-r">
												<img
													src={frame.imageData}
													alt={`原图 ${index + 1}`}
													className="aspect-[9/16] w-full object-cover"
												/>
												<div className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-zinc-300">
													原图
												</div>
											</div>
											<div className="relative w-1/2">
												{frame.generationStatus === 'completed' && frame.generatedImage ? (
													<>
														<img
															src={frame.generatedImage}
															alt={`AI 风格 ${index + 1}`}
															className="aspect-[9/16] w-full object-cover"
															style={{ filter: 'contrast(1.1) saturate(0.8)' }}
														/>
														<div className="absolute top-1 left-1 flex items-center gap-1 rounded bg-emerald-500/80 px-1.5 py-0.5 text-xs text-white">
															<Check className="h-3 w-3" />
															AI
														</div>
													</>
												) : frame.generationStatus === 'generating' ? (
													<div className="flex aspect-[9/16] items-center justify-center bg-zinc-800">
														<div className="text-center">
															<Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-400" />
															<p className="mt-2 text-xs text-zinc-400">AI 生成中...</p>
														</div>
													</div>
												) : frame.generationStatus === 'error' ? (
													<div className="flex aspect-[9/16] items-center justify-center bg-zinc-800">
														<div className="text-center">
															<p className="text-xs text-red-400">生成失败</p>
															<Button
																size="sm"
																variant="ghost"
																onClick={() => generateMangaForFrame(frame.id)}
																className="mt-2 h-7 text-xs text-zinc-400 hover:text-white"
															>
																<RefreshCw className="mr-1 h-3 w-3" />
																重试
															</Button>
														</div>
													</div>
												) : (
													<div className="flex aspect-[9/16] items-center justify-center bg-zinc-800">
														<div className="text-center">
															<Wand2 className="mx-auto h-6 w-6 text-zinc-600" />
															<p className="mt-2 text-xs text-zinc-500">待生成</p>
														</div>
													</div>
												)}
											</div>
										</div>
										<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
											{formatTime(frame.timestamp)}
										</div>
										<div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 font-bold text-xs text-white">
											{index + 1}
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</aside>

				{/* 右侧 Video Panel */}
				<section className="flex flex-1 flex-col p-4">
					<div className="mb-4">
						<h2 className="mb-2 flex items-center gap-2 font-semibold text-sm text-zinc-300">
							<Video className="h-4 w-4 text-violet-400" />
							视频预览
							{videoUrl && (
								<span className="ml-auto font-normal text-xs text-zinc-500">
									点击视频区域外，按空格键捕获当前画面
								</span>
							)}
						</h2>
						<div className="relative overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
							{videoUrl ? (
								<>
									{/* biome-ignore lint/a11y/useMediaCaption: Demo project */}
									<video
										ref={videoRef}
										src={videoUrl}
										className="aspect-video w-full bg-black"
										onTimeUpdate={handleTimeUpdate}
										onLoadedMetadata={handleLoadedMetadata}
										onPlay={handlePlay}
										onPause={handlePause}
										onClick={togglePlay}
										onKeyDown={(e) => e.key === ' ' && togglePlay()}
										crossOrigin="anonymous"
									/>
									<div className="absolute right-0 bottom-0 left-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-4">
										<Button
											size="icon"
											variant="ghost"
											className="h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/20"
											onClick={togglePlay}
										>
											{isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
										</Button>
										{/* biome-ignore lint/a11y/useKeyWithClickEvents: Progress bar */}
										<div
											className="h-1 flex-1 cursor-pointer rounded-full bg-white/20"
											onClick={handleProgressClick}
										>
											<div
												className="h-full rounded-full bg-violet-500 transition-all"
												style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
											/>
										</div>
										<span className="font-mono text-sm text-white/70">
											{formatTime(currentTime)} / {formatTime(duration)}
										</span>
									</div>
								</>
							) : (
								<div className="flex aspect-video items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
									<div className="text-center">
										<Upload className="mx-auto mb-2 h-12 w-12 text-zinc-700" />
										<p className="text-sm text-zinc-500">请先上传视频文件</p>
										<p className="mt-1 text-xs text-zinc-600">支持 MP4、MOV、WebM 等格式</p>
									</div>
								</div>
							)}
						</div>
					</div>

					<div className="mb-4 flex justify-center gap-3">
						<Button
							onClick={captureFrame}
							disabled={!videoUrl || capturedFrames.length >= 10}
							className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
						>
							<ImageIcon className="mr-2 h-4 w-4" />
							捕获当前画面 ({capturedFrames.length}/10)
						</Button>
					</div>

					<div className="flex-1">
						<h3 className="mb-3 flex items-center gap-2 font-semibold text-sm text-zinc-300">
							<ImageIcon className="h-4 w-4 text-emerald-400" />
							已捕获画面 ({capturedFrames.length}/10)
							{completedCount > 0 && (
								<span className="ml-auto text-xs text-emerald-400">
									{completedCount} 张已生成 AI 风格
								</span>
							)}
						</h3>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{capturedFrames.length === 0 ? (
								<div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 py-12 text-center">
									<ImageIcon className="mb-2 h-10 w-10 text-zinc-600" />
									<p className="text-sm text-zinc-500">暂无捕获画面</p>
									<p className="text-xs text-zinc-600">播放视频时按空格键捕获</p>
								</div>
							) : (
								capturedFrames.map((frame, index) => (
									<div
										key={frame.id}
										className="group relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800/50 transition-all hover:border-violet-500"
									>
										<button
											type="button"
											className="relative w-full"
											onClick={() => seekToTime(frame.timestamp)}
										>
											{frame.generationStatus === 'completed' && frame.generatedImage ? (
												<img
													src={frame.generatedImage}
													alt={`AI 风格 ${index + 1}`}
													className="aspect-video w-full object-cover"
													style={{ filter: 'contrast(1.1) saturate(0.8)' }}
												/>
											) : (
												<img
													src={frame.imageData}
													alt={`捕获画面 ${index + 1}`}
													className="aspect-video w-full object-cover"
												/>
											)}
											{frame.generationStatus === 'generating' && (
												<div className="absolute inset-0 flex items-center justify-center bg-black/60">
													<Loader2 className="h-6 w-6 animate-spin text-violet-400" />
												</div>
											)}
										</button>

										<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
											{formatTime(frame.timestamp)}
										</div>

										<div className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 font-bold text-xs text-white">
											{index + 1}
										</div>

										{frame.generationStatus === 'completed' && (
											<div className="absolute top-1 left-7 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
												<Check className="h-3 w-3 text-white" />
											</div>
										)}

										<div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											{frame.generationStatus !== 'generating' && (
												<button
													type="button"
													onMouseDown={(e) => {
														e.stopPropagation()
														e.preventDefault()
														if (frame.generationStatus === 'completed') {
															resetFrameGeneration(frame.id)
														} else {
															generateMangaForFrame(frame.id)
														}
													}}
													className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/80 text-white hover:bg-violet-600"
													title={frame.generationStatus === 'completed' ? '重新生成' : '生成 AI 风格'}
												>
													{frame.generationStatus === 'completed' ? (
														<RefreshCw className="h-3 w-3" />
													) : (
														<Wand2 className="h-3 w-3" />
													)}
												</button>
											)}
											<button
												type="button"
												onMouseDown={(e) => {
													e.stopPropagation()
													e.preventDefault()
													handleDeleteFrame(frame.id)
												}}
												className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-600"
											>
												<Trash2 className="h-3 w-3" />
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</section>
			</div>

			{/* 底部导出区域 */}
			<footer className="border-zinc-800 border-t bg-zinc-900/50 px-4 py-4 backdrop-blur-sm">
				<div className="mx-auto max-w-7xl">
					{/* 导出设置 */}
					{completedCount > 0 && (
						<div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
							<div className="flex items-center gap-2">
								<Film className="h-4 w-4 text-violet-400" />
								<span className="text-sm text-zinc-300">导出设置</span>
							</div>
							<div className="flex items-center gap-2">
								<label htmlFor="imageDuration" className="text-xs text-zinc-400">
									每张图片停留:
								</label>
								<select
									id="imageDuration"
									value={imageDuration}
									onChange={(e) => setImageDuration(Number(e.target.value))}
									className="rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-sm text-zinc-100"
									disabled={exportStatus === 'exporting'}
								>
									<option value={1}>1 秒</option>
									<option value={2}>2 秒</option>
									<option value={3}>3 秒</option>
									<option value={5}>5 秒</option>
								</select>
							</div>
							<div className="text-xs text-zinc-500">
								原视频: {formatTime(duration)} → 预计新视频: {formatTime(estimatedDuration)}
							</div>
						</div>
					)}

					{/* 进度和导出按钮 */}
					<div className="flex flex-col items-center gap-4 sm:flex-row">
						<div className="flex-1">
							<div className="mb-1 flex items-center justify-between text-sm">
								<span className="flex items-center gap-2 text-zinc-400">
									{exportStatus === 'exporting' && (
										<Loader2 className="h-3 w-3 animate-spin text-violet-400" />
									)}
									{exportStatus === 'completed' && <Check className="h-3 w-3 text-emerald-400" />}
									{exportStatus === 'error' && <AlertCircle className="h-3 w-3 text-red-400" />}
									{exportMessage || '导出进度'}
								</span>
								<span className="text-zinc-300">{progress}%</span>
							</div>
							<Progress value={progress} className="h-2 bg-zinc-800" />
						</div>
						{exportStatus === 'error' ? (
							<Button
								onClick={resetExport}
								className="w-full bg-zinc-700 text-white hover:bg-zinc-600 sm:w-auto"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								重试
							</Button>
						) : (
							<Button
								onClick={handleExport}
								disabled={completedCount === 0 || exportStatus === 'exporting'}
								className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 sm:w-auto"
							>
								{exportStatus === 'exporting' ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										导出中...
									</>
								) : (
									<>
										<Download className="mr-2 h-4 w-4" />
										导出视频 ({completedCount} 张)
									</>
								)}
							</Button>
						)}
					</div>

					{/* 技术说明 */}
					<div className="mt-3 text-center text-xs text-zinc-600">
						💡 视频播放到关键帧时，画面将完全切换为线稿图片并持续 {imageDuration} 秒，然后继续播放原视频（按时间顺序依次展示）
					</div>
				</div>
			</footer>
		</main>
	)
}
