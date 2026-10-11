import { SCALE_MODES, SCALE_LABELS, type ScaleMode } from '../model/timeline';

import { Select } from '../../../components/ui/Select';
import type { DropdownOption } from '../../../components/ui/Dropdown';

const scaleOptions: DropdownOption<ScaleMode>[] = SCALE_MODES.map((value) => ({
    value,
    label: SCALE_LABELS[value],
}));

type Props = {
    mode: ScaleMode;
    onModeChange: (mode: ScaleMode) => void;
};

export function TimelineToolbar({ mode, onModeChange }: Props) {
    return (
        <div className="timeline-toolbar">
            <div className="timeline-scale">
                <Select
                    label="Масштаб диаграммы"
                    value={mode}
                    options={scaleOptions}
                    onChange={onModeChange}
                />
            </div>
        </div>
    );
}
