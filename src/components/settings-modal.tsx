'use client'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { PRESET_CONFIGS, useSettingsStore } from '@/store/settings'
import {
	Check,
	Eye,
	EyeOff,
	Key,
	Link2,
	RefreshCw,
	Sparkles,
	Cpu,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

export function SettingsModal() {
	const { settings, setSettings, resetSettings, isSettingsOpen, closeSettings } =
		useSettingsStore()

	const [showKey, setShowKey] = useState(false)
	const [selectedPreset, setSelectedPreset] = useState<string>('aihubmix')
	const [isTesting, setIsTesting] = useState(false)
	const [modelOptions, setModelOptions] = useState<string[]>([])
	const [isLoadingModels, setIsLoadingModels] = useState(false)
	const [modelLoadError, setModelLoadError] = useState<string | null>(null)

	// 获取模型列表（从聚合平台动态拉取）
	const fetchModels = async () => {
		if (!settings.baseUrl || !settings.apiKey) {
			setModelOptions([])
			return
		}

		setIsLoadingModels(true)
		setModelLoadError(null)
		try {
			const response = await fetch('/api/models', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					baseUrl: settings.baseUrl,
					apiKey: settings.apiKey,
				}),
			})
			const data = await response.json()
			if (data.success) {
				setModelOptions(data.models || [])
				if (Array.isArray(data.models) && data.models.length > 0 && !settings.model) {
					setSettings({ model: data.models[0] })
				}
			} else {
				setModelOptions([])
				setModelLoadError(data.error || '获取模型列表失败')
			}
		} catch (error) {
			setModelOptions([])
			setModelLoadError(error instanceof Error ? error.message : '获取模型列表失败')
		} finally {
			setIsLoadingModels(false)
		}
	}

	useEffect(() => {
		if (isSettingsOpen) {
			fetchModels()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isSettingsOpen, settings.baseUrl, settings.apiKey])

	// 应用预设配置
	const applyPreset = (presetKey: string) => {
		setSelectedPreset(presetKey)
		const preset = PRESET_CONFIGS[presetKey as keyof typeof PRESET_CONFIGS]
		if (preset && presetKey !== 'custom') {
			setSettings({
				baseUrl: preset.baseUrl,
			})
			toast.success(`已应用 ${preset.name} 配置`)
		}
	}

	// 测试 API 连接
	const testConnection = async () => {
		if (!settings.apiKey) {
			toast.error('请先填写 API Key')
			return
		}

		setIsTesting(true)
		try {
			const response = await fetch('/api/test-connection', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					baseUrl: settings.baseUrl,
					apiKey: settings.apiKey,
					model: settings.model,
				}),
			})

			const data = await response.json()
			if (data.success) {
				toast.success('连接成功！API 配置有效')
			} else {
				toast.error(data.error || '连接失败')
			}
		} catch {
			toast.error('网络错误，请检查配置')
		} finally {
			setIsTesting(false)
		}
	}

	// 保存并关闭
	const handleSave = () => {
		if (!settings.apiKey) {
			toast.warning('提示：未配置 API Key，部分功能可能无法使用')
		} else {
			toast.success('设置已保存')
		}
		closeSettings()
	}

	return (
		<Dialog open={isSettingsOpen} onOpenChange={(open) => !open && closeSettings()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-700 bg-zinc-900 text-zinc-100 sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-xl">
						<Sparkles className="h-5 w-5 text-violet-400" />
						API 设置
					</DialogTitle>
					<DialogDescription className="text-zinc-400">
						配置 AI 模型的 API 连接（用于 Prompt 增强和图像生成）
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* 快速选择预设 */}
					<div className="space-y-2">
						<Label className="text-zinc-300">快速选择平台</Label>
						<div className="flex flex-wrap gap-2">
							{Object.entries(PRESET_CONFIGS).map(([key, config]) => (
								<Button
									key={key}
									size="sm"
									variant={selectedPreset === key ? 'default' : 'outline'}
									className={
										selectedPreset === key
											? 'bg-violet-600 text-white hover:bg-violet-500'
											: 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
									}
									onClick={() => applyPreset(key)}
								>
									{config.name}
								</Button>
							))}
						</div>
					</div>

					{/* API 配置 */}
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="baseUrl" className="flex items-center gap-2 text-zinc-300">
								<Link2 className="h-4 w-4" />
								API Base URL
							</Label>
							<Input
								id="baseUrl"
								value={settings.baseUrl || ''}
								onChange={(e) => setSettings({ baseUrl: e.target.value })}
								placeholder="https://aihubmix.com/v1"
								className="border-zinc-700 bg-zinc-800 text-zinc-100"
							/>
							<p className="text-xs text-zinc-500">
								聚合平台示例：https://aihubmix.com/v1
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="apiKey" className="flex items-center gap-2 text-zinc-300">
								<Key className="h-4 w-4" />
								API Key
							</Label>
							<div className="relative">
								<Input
									id="apiKey"
									type={showKey ? 'text' : 'password'}
									value={settings.apiKey || ''}
									onChange={(e) => setSettings({ apiKey: e.target.value })}
									placeholder="sk-..."
									className="border-zinc-700 bg-zinc-800 pr-10 text-zinc-100"
								/>
								<button
									type="button"
									onClick={() => setShowKey(!showKey)}
									className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
								>
									{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</button>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="model" className="flex items-center gap-2 text-zinc-300">
									<Cpu className="h-4 w-4" />
									AI 模型
								</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={fetchModels}
									disabled={isLoadingModels || !settings.apiKey}
									className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
								>
									<RefreshCw className={`mr-1 h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
									刷新模型
								</Button>
							</div>

							{modelOptions.length > 0 ? (
								<Select
									value={settings.model || modelOptions[0]}
									onValueChange={(value) => setSettings({ model: value })}
								>
									<SelectTrigger
										id="model"
										className="border-zinc-700 bg-zinc-800 text-zinc-100"
									>
										<SelectValue placeholder="选择模型" />
									</SelectTrigger>
									<SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
										{modelOptions.map((model) => (
											<SelectItem key={model} value={model}>
												{model}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<Input
									id="model"
									value={settings.model || ''}
									onChange={(e) => setSettings({ model: e.target.value })}
									placeholder="gemini-2.5-flash-image"
									className="border-zinc-700 bg-zinc-800 text-zinc-100"
								/>
							)}

							{modelLoadError ? (
								<p className="text-xs text-amber-400">⚠️ {modelLoadError}</p>
							) : (
								<p className="text-xs text-zinc-500">
									按平台实际模型列表展示；若未加载成功可手动输入
								</p>
							)}
						</div>
					</div>

					{/* 操作按钮 */}
					<div className="flex items-center justify-between border-zinc-700 border-t pt-4">
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={resetSettings}
								className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								重置
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={testConnection}
								disabled={isTesting || !settings.apiKey}
								className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
							>
								{isTesting ? (
									<>
										<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
										测试中
									</>
								) : (
									<>
										<Check className="mr-2 h-4 w-4" />
										测试连接
									</>
								)}
							</Button>
						</div>
						<Button
							onClick={handleSave}
							className="bg-violet-600 text-white hover:bg-violet-500"
						>
							保存设置
						</Button>
					</div>

					{/* 配置提示 */}
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
						💡 <strong>提示：</strong>
						API Key 仅保存在本地浏览器中，不会上传到服务器。推荐使用 Gemini 系列模型（如 gemini-2.5-flash-image）。
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
