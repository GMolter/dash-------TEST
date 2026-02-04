import { useState } from 'react';
import { QrCode, Download } from 'lucide-react';

export function QRCodeGenerator() {
  const [text, setText] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const generateQRCode = () => {
    if (!text) return;

    const encoded = encodeURIComponent(text);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
    setQrCodeUrl(url);
  };

  const downloadQRCode = async () => {
    if (!qrCodeUrl) return;

    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download QR code');
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          QR Code Generator
        </h2>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-slate-900/50 rounded-lg">
          <textarea
            placeholder="Enter text or URL to generate QR code..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <button
            onClick={generateQRCode}
            className="w-full mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
          >
            Generate QR Code
          </button>
        </div>

        {qrCodeUrl && (
          <div className="p-4 bg-slate-900/50 rounded-lg flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
            </div>
            <button
              onClick={downloadQRCode}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Download QR Code
            </button>
          </div>
        )}

        {!qrCodeUrl && (
          <div className="p-8 bg-slate-900/50 rounded-lg text-center">
            <QrCode className="w-16 h-16 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Enter text above and click generate to create a QR code</p>
          </div>
        )}
      </div>
    </div>
  );
}
