import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

const DEFAULT_JSON = `{
  "mso.geofences": "Geofences",
  "mso.create.group": "Create Group",
  "mso.create.fence": "Create Geofence"
}`;

type ParsedJson = Record<string, string | number | boolean>;

export function I18nConverterPage() {
  const [jsonInput, setJsonInput] = useState<string>(DEFAULT_JSON);
  const [excelResult, setExcelResult] = useState<ParsedJson | null>(null);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<string>('');

  const parsedJson = useMemo<ParsedJson | null>(() => {
    try {
      const parsed: unknown = JSON.parse(jsonInput);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as ParsedJson;
      }
      return null;
    } catch {
      return null;
    }
  }, [jsonInput]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2000);
  }

  // JSON → Excel
  function exportToExcel(customNames = false) {
    setError('');
    if (!parsedJson) {
      setError('JSON 格式错误，请检查输入');
      return;
    }

    const entries = Object.entries(parsedJson);
    const colKey = customNames ? '英文键(English Key)' : 'Key';
    const colValue = customNames ? '中文值(Chinese Value)' : 'Value';

    const rows = entries.map(([key, value]) => ({
      [colKey]: key,
      [colValue]: String(value),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [{ wch: 40 }, { wch: 40 }];

    const sheetName = customNames ? '国际化配置' : 'Translations';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const fileName = customNames ? `i18n_${Date.now()}.xlsx` : `translations_${Date.now()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('导出成功');
  }

  // Excel → JSON
  function handleExcelUpload(event: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setError('Excel 文件为空');
          return;
        }
        const firstSheet = workbook.Sheets[firstSheetName];
        if (!firstSheet) {
          setError('无法读取工作表');
          return;
        }
        const excelRows = XLSX.utils.sheet_to_json(firstSheet) as Array<Record<string, unknown>>;

        const result: ParsedJson = {};
        for (const row of excelRows) {
          const keys = Object.keys(row);
          if (keys.length >= 2) {
            const colKey = keys[0];
            const colVal = keys[1];
            if (colKey === undefined || colVal === undefined) continue;
            const key = row[colKey];
            const value = row[colVal];
            if (typeof key === 'string' && key && value !== undefined && value !== null) {
              result[key] = String(value);
            }
          }
        }

        setExcelResult(result);
        showToast('转换成功');
      } catch {
        setError('文件解析失败');
      }
    };
    reader.onerror = () => {
      setError('文件读取失败');
    };
    reader.readAsArrayBuffer(file);
    // 重置 input 值，允许相同文件重复上传
    event.target.value = '';
  }

  async function copyToClipboard() {
    if (!excelResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(excelResult, null, 2));
      showToast('已复制到剪贴板');
    } catch {
      setError('复制失败');
    }
  }

  return (
    <div className="ffm-i18n-page">
      <h3 className="ffm-i18n-title">国际化数据转换工具</h3>

      {/* JSON 输入区域 */}
      <section className="ffm-i18n-section">
        <h4 className="ffm-i18n-subtitle">输入 JSON 数据：</h4>
        <textarea
          className="ffm-i18n-textarea"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={10}
          placeholder='{
  "mso.geofences": "Geofences",
  "mso.create.group": "Create Group",
  "mso.create.fence": "Create Geofence"
}'
          spellCheck={false}
        />
        <div className="ffm-i18n-meta">
          {parsedJson ? (
            <span className="ffm-i18n-valid">
              ✓ JSON 有效，共 {Object.keys(parsedJson).length} 条
            </span>
          ) : (
            <span className="ffm-i18n-invalid">✗ JSON 格式错误</span>
          )}
        </div>
      </section>

      {/* 转换按钮 */}
      <section className="ffm-i18n-section">
        <div className="ffm-i18n-buttons">
          <button
            className="ffm-btn ffm-btn-primary"
            onClick={() => exportToExcel(false)}
            disabled={!parsedJson}
          >
            导出为 Excel（两列）
          </button>
          <button
            className="ffm-btn ffm-btn-success"
            onClick={() => exportToExcel(true)}
            disabled={!parsedJson}
          >
            导出（自定义列名）
          </button>
        </div>
      </section>

      {/* Excel 上传区域 */}
      <section className="ffm-i18n-section">
        <h4 className="ffm-i18n-subtitle">上传 Excel 文件：</h4>
        <div className="ffm-i18n-upload">
          <label className="ffm-btn ffm-btn-primary ffm-btn-upload">
            导入 Excel 文件
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              style={{ display: 'none' }}
            />
          </label>
          <span className="ffm-i18n-hint">支持 .xlsx 和 .xls 格式，取前两列作为 Key / Value</span>
        </div>
      </section>

      {/* 错误提示 */}
      {error && <div className="ffm-i18n-error">{error}</div>}

      {/* 转换结果 */}
      {excelResult && (
        <section className="ffm-i18n-section">
          <h4 className="ffm-i18n-subtitle">转换结果：</h4>
          <pre className="ffm-i18n-result">{JSON.stringify(excelResult, null, 2)}</pre>
          <button className="ffm-btn ffm-btn-success" onClick={copyToClipboard}>
            复制 JSON
          </button>
        </section>
      )}

      {/* Toast */}
      {toast && <div className="ffm-i18n-toast">{toast}</div>}
    </div>
  );
}
