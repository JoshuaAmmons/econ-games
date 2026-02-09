import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Card } from '../shared/Card';
import { Download, Loader2 } from 'lucide-react';

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  filename?: string;
}

/**
 * Reusable chart wrapper with PNG download capability.
 * Wraps chart content in a Card with a title and "Download PNG" button.
 */
export const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, filename }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!chartRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, // 2x resolution for crisp exports
      });
      const link = document.createElement('a');
      link.download = filename || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export chart as PNG:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">{title}</h3>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors disabled:opacity-50"
          title="Download as PNG"
        >
          {downloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          PNG
        </button>
      </div>
      <div ref={chartRef} className="bg-white p-2">
        {children}
      </div>
    </Card>
  );
};
