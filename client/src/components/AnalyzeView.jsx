import React from 'react';
import AnalyzingScreen from './AnalyzingScreen';
import ResultPanel from './ResultPanel';
import UploadStep from './UploadStep';

const AnalyzeView = () => {
    return (
        <div>
            <AnalyzingScreen />
            <ResultPanel />
            <UploadStep />
        </div>
    );
};

export default AnalyzeView;