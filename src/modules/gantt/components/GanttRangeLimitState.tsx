import { Link } from 'react-router';
import { SCALE_LABELS, type ScaleMode } from '../model/timeline';

type Props = {
    mode: ScaleMode;
    search: string;
};

export function GanttRangeLimitState({ mode, search }: Props) {
    return (
        <div className="empty-state" role="status">
            <h2>Период слишком длинный для масштаба «{SCALE_LABELS[mode]}»</h2>
            <p>
                Выберите более крупный масштаб в панели над диаграммой или проверьте сроки задач в
                списке.
            </p>
            <Link className="primary-button" to={{ pathname: '/list', search }}>
                Перейти к списку
            </Link>
        </div>
    );
}
