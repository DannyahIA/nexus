import { memo } from 'react'
import FloatingLines from './FloatingLinesBackground'

const WAVES_CONFIG: ("top" | "middle" | "bottom")[] = ['top', 'middle', 'bottom'];

const AppBackground = memo(() => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-black" />
            <FloatingLines
                enabledWaves={WAVES_CONFIG}
                lineCount={3} // Reduced count for main app to be less distracting
                lineDistance={60}
                bendRadius={5.0}
                bendStrength={-0.3} // Reduced strength
                interactive={true}
                parallax={true}
            />
            <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black pointer-events-none" />
        </div>
    )
});

AppBackground.displayName = 'AppBackground';

export default AppBackground;
