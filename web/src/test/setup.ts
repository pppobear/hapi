import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

function createMemoryStorage(): Storage {
    const store = new Map<string, string>()

    return {
        getItem(key: string): string | null {
            return store.get(key) ?? null
        },
        setItem(key: string, value: string): void {
            store.set(key, String(value))
        },
        removeItem(key: string): void {
            store.delete(key)
        },
        clear(): void {
            store.clear()
        },
        key(index: number): string | null {
            return Array.from(store.keys())[index] ?? null
        },
        get length(): number {
            return store.size
        }
    }
}

const localStorageMock = createMemoryStorage()
const sessionStorageMock = createMemoryStorage()

Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock
})

Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: sessionStorageMock
})

beforeEach(() => {
    localStorageMock.clear()
    sessionStorageMock.clear()
})
