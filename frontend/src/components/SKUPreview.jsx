export default function SKUPreview({ preview, itemType, onTypeChange, onCreateItem, onCopyPermalink, onSubmitHelpdesk, creating }) {
  const btnClass = 'px-3 py-1.5 rounded text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1';

  return (
    <div className="bg-white border rounded-lg p-5 h-fit">
      <div className="space-y-3 mb-5">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <span className="font-semibold text-gray-600">Name</span>
          <span className="col-span-2 text-gray-800">{preview?.name || '—'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <span className="font-semibold text-gray-600">SKU</span>
          <span className="col-span-2 font-mono text-gray-800">{preview?.sku || '—'}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <span className="font-semibold text-gray-600">Desc</span>
          <span className="col-span-2 text-gray-800">{preview?.description || '—'}</span>
        </div>
      </div>

      <div className="flex gap-4 mb-4 text-sm">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" value="Trading" checked={itemType === 'Trading'} onChange={() => onTypeChange('Trading')} />
          Trading
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" value="Manufacturing" checked={itemType === 'Manufacturing'} onChange={() => onTypeChange('Manufacturing')} />
          Manufacturing
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={onCreateItem} disabled={!preview?.sku || creating} className={btnClass}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {creating ? 'Creating…' : 'Create Item'}
          </button>
          <button onClick={onCopyPermalink} disabled={!preview?.sku} className={btnClass}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copy Permalink
          </button>
        </div>
        <button onClick={onSubmitHelpdesk} disabled={!preview?.sku} className={btnClass + ' w-fit'}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Submit To Helpdesk
        </button>
      </div>
    </div>
  );
}
