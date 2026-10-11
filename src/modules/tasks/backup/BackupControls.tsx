import { useRef, useState } from 'react';
import type { Task } from '../../../lib/task';
import { createCurrentBackup, MAX_BACKUP_BYTES, parseBackup } from './backup';
import { taskRepository } from '../data/taskRepository';

type Props = {
    isBusy: boolean;
    onImport: (tasks: Task[]) => Promise<void>;
    onError: (message: string) => void;
};

export function BackupControls({ isBusy, onImport, onError }: Props) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [working, setWorking] = useState<'export' | 'import' | null>(null);

    async function exportBackup() {
        setWorking('export');
        try {
            const blob = new Blob([await createCurrentBackup()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `task-planner-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Не удалось скачать копию');
        } finally {
            setWorking(null);
        }
    }

    async function importBackup(file: File | undefined = undefined) {
        if (file === undefined) {
            return;
        }
        setWorking('import');
        try {
            if (file.size > MAX_BACKUP_BYTES) {
                throw new Error('Файл резервной копии слишком большой (максимум 10 МБ).');
            }
            const imported = parseBackup(await file.text());
            const current = await taskRepository.list();
            if (
                !window.confirm(
                    `Заменить все ${current.length} текущих задач на ${imported.length} задач из файла? Это действие нельзя отменить.`,
                )
            ) {
                return;
            }
            await onImport(imported);
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Не удалось открыть файл');
        } finally {
            if (fileInput.current !== null) {
                fileInput.current.value = '';
            }
            setWorking(null);
        }
    }

    return (
        <div className="backup-controls" aria-label="Резервная копия задач">
            <button
                type="button"
                onClick={() => void exportBackup()}
                disabled={isBusy || working !== null}
            >
                {working === 'export' ? 'Подготовка…' : 'Скачать копию'}
            </button>
            <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={isBusy || working !== null}
            >
                {working === 'import' ? 'Восстановление…' : 'Восстановить из файла'}
            </button>
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => void importBackup(event.target.files?.[0])}
            />
        </div>
    );
}
