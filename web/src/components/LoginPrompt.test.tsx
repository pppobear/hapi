import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { LoginPrompt } from './LoginPrompt'

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('LoginPrompt', () => {
    const originalLocalStorage = window.localStorage

    beforeEach(() => {
        vi.clearAllMocks()
        const store = new Map<string, string>()
        const localStorageMock = {
            getItem: vi.fn((key: string) => store.get(key) ?? (key === 'hapi-lang' ? 'en' : null)),
            setItem: vi.fn((key: string, value: string) => {
                store.set(key, value)
            }),
            removeItem: vi.fn((key: string) => {
                store.delete(key)
            }),
            clear: vi.fn(() => {
                store.clear()
            }),
            key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
            get length() {
                return store.size
            }
        }
        Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
    })

    afterEach(() => {
        Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage })
    })

    it('does not clear first hub URL edit when hub URL required', async () => {
        renderWithProviders(
            <LoginPrompt
                baseUrl="https://app.example.com"
                serverUrl={null}
                setServerUrl={vi.fn((value: string) => ({ ok: true as const, value }))}
                clearServerUrl={vi.fn()}
                requireServerUrl={true}
                onLogin={vi.fn()}
            />
        )

        fireEvent.change(screen.getByPlaceholderText('Access token'), { target: { value: 'token' } })
        fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

        const hubInput = await screen.findByPlaceholderText('https://hapi.example.com')
        expect(screen.getByText('Hub URL required. Please set it before signing in.')).toBeInTheDocument()

        fireEvent.change(hubInput, { target: { value: 'https://hub.example.com' } })

        expect(hubInput).toHaveValue('https://hub.example.com')
        expect(screen.queryByText('Hub URL required. Please set it before signing in.')).not.toBeInTheDocument()
    })
})
