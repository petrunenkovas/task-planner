import { NavLink } from 'react-router';
import type { Task } from '../../lib/task';
import { BackupControls } from '../../modules/tasks/backup/BackupControls';
import { WORKSPACE_ROUTES } from '../../routes';

type Props = {
    search: string;
    saveState: string | null;
    isBusy: boolean;
    isBackupBusy: boolean;
    onImport: (tasks: Task[]) => Promise<void>;
    onError: (message: string) => void;
    onCreate: () => void;
};

export function PlannerNavbar({
    search,
    saveState,
    isBusy,
    isBackupBusy,
    onImport,
    onError,
    onCreate,
}: Props) {
    return (
        <header className="app-navbar">
            <div className="navbar-content">
                <div className="navbar-start">
                    <div className="navbar-brand">
                        <h1>Планировщик задач</h1>
                    </div>
                    <nav className="view-tabs" aria-label="Представление задач">
                        {WORKSPACE_ROUTES.map((route) => (
                            <NavLink
                                key={route.path}
                                to={{ pathname: route.path, search }}
                                className={({ isActive }) => (isActive ? 'selected' : '')}
                            >
                                {route.label}
                            </NavLink>
                        ))}
                    </nav>
                </div>
                <div className="navbar-end">
                    <span className="save-state" role="status">
                        {saveState}
                    </span>
                    <BackupControls isBusy={isBackupBusy} onImport={onImport} onError={onError} />
                    <button className="primary-button" onClick={onCreate} disabled={isBusy}>
                        + Новая задача
                    </button>
                </div>
            </div>
        </header>
    );
}
