import { describe, it, expect, vi } from 'vitest';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: () => {},
        warn: () => {}
    }
}));

import { filterManagedSessionSubcommand } from './codexLocal';

describe('filterManagedSessionSubcommand', () => {
    it('returns empty array unchanged', () => {
        expect(filterManagedSessionSubcommand([])).toEqual([]);
    });

    it('passes through args when first arg is not resume', () => {
        expect(filterManagedSessionSubcommand(['--model', 'gpt-4'])).toEqual(['--model', 'gpt-4']);
        expect(filterManagedSessionSubcommand(['--sandbox', 'read-only'])).toEqual(['--sandbox', 'read-only']);
    });

    it('filters resume subcommand with session ID', () => {
        expect(filterManagedSessionSubcommand(['resume', 'abc-123'])).toEqual([]);
        expect(filterManagedSessionSubcommand(['resume', 'abc-123', '--model', 'gpt-4']))
            .toEqual(['--model', 'gpt-4']);
    });

    it('filters resume subcommand without session ID', () => {
        expect(filterManagedSessionSubcommand(['resume'])).toEqual([]);
        expect(filterManagedSessionSubcommand(['resume', '--model', 'gpt-4']))
            .toEqual(['--model', 'gpt-4']);
    });

    it('filters fork subcommand with session ID', () => {
        expect(filterManagedSessionSubcommand(['fork', 'abc-123'])).toEqual([]);
        expect(filterManagedSessionSubcommand(['fork', 'abc-123', '--model', 'gpt-4']))
            .toEqual(['--model', 'gpt-4']);
    });

    it('does not filter resume when it appears as flag value', () => {
        // --name resume should pass through (resume is value, not subcommand)
        expect(filterManagedSessionSubcommand(['--name', 'resume'])).toEqual(['--name', 'resume']);
    });

    it('does not filter resume in middle of args', () => {
        // If resume appears after flags, it's not the subcommand position
        expect(filterManagedSessionSubcommand(['--model', 'gpt-4', 'resume', '123']))
            .toEqual(['--model', 'gpt-4', 'resume', '123']);
    });

    it('does not filter fork in middle of args', () => {
        expect(filterManagedSessionSubcommand(['--model', 'gpt-4', 'fork', '123']))
            .toEqual(['--model', 'gpt-4', 'fork', '123']);
    });
});
