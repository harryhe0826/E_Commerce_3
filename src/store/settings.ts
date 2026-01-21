/**
 * API 设置 Store
 * 
 * 使用 Zustand 管理 API 配置
 * 数据持久化到 localStorage
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// API 配置类型（简化版：统一使用一个模型）
export interface ApiSettings {
	baseUrl: string
	apiKey: string
	model: string // 统一的模型，用于 LLM 和图像生成
}

// Store 状态和方法
interface SettingsStore {
	settings: ApiSettings
	isSettingsOpen: boolean

	// Actions
	setSettings: (settings: Partial<ApiSettings>) => void
	resetSettings: () => void
	openSettings: () => void
	closeSettings: () => void

	// Getters
	getConfig: () => { baseUrl: string; apiKey: string; model: string }
}

// 默认配置
const defaultSettings: ApiSettings = {
	baseUrl: 'https://aihubmix.com/v1',
	apiKey: '',
	model: 'gemini-2.5-flash-image', // 默认使用 Gemini 图生图模型
}

// 创建 Store
export const useSettingsStore = create<SettingsStore>()(
	persist(
		(set, get) => ({
			settings: defaultSettings,
			isSettingsOpen: false,

			setSettings: (newSettings) =>
				set((state) => ({
					settings: { ...state.settings, ...newSettings },
				})),

			resetSettings: () =>
				set({ settings: defaultSettings }),

			openSettings: () => set({ isSettingsOpen: true }),
			closeSettings: () => set({ isSettingsOpen: false }),

			// 获取配置
			getConfig: () => {
				const { settings } = get()
				return {
					baseUrl: settings.baseUrl,
					apiKey: settings.apiKey,
					model: settings.model,
				}
			},
		}),
		{
			name: 'itgen-settings', // localStorage key
		}
	)
)

// 预设的聚合平台配置
export const PRESET_CONFIGS = {
	aihubmix: {
		name: 'AIHubMix',
		baseUrl: 'https://aihubmix.com/v1',
	},
	openai: {
		name: 'OpenAI 官方',
		baseUrl: 'https://api.openai.com/v1',
	},
	openrouter: {
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
	},
	custom: {
		name: '自定义',
		baseUrl: '',
	},
}
