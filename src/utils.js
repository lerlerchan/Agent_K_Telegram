const isUserAllowed = (userId) => {
  const ids = (process.env.ALLOWED_TELEGRAM_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  return ids.length > 0 && ids.includes(userId);
};

const splitMessage = (msg, max = 4000) => {
  if (!msg || msg.length <= max) return [msg || 'No response'];
  const chunks = [];
  let rest = msg;
  while (rest.length > 0) {
    if (rest.length <= max) { chunks.push(rest); break; }
    let i = rest.lastIndexOf('\n', max);
    if (i < max / 2) i = rest.lastIndexOf(' ', max);
    if (i < max / 2) i = max;
    chunks.push(rest.slice(0, i));
    rest = rest.slice(i).trimStart();
  }
  return chunks;
};

const markdownToHtml = (text) => {
  if (!text) return text;

  // First, convert markdown tables to readable format (before HTML escaping)
  text = convertTablesToReadable(text);

  // Clean any remaining table artifacts
  text = cleanTableRemnants(text);

  // Clean up excessive whitespace and blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // Escape HTML entities but preserve our formatting tags
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore our formatting tags that were added by convertTablesToReadable
  text = text
    .replace(/&lt;b&gt;/g, '<b>')
    .replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;i&gt;/g, '<i>')
    .replace(/&lt;\/i&gt;/g, '</i>')
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>');

  // Apply markdown formatting
  text = text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre>$2</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<b>$1</b>')
    // Italic
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<i>$1</i>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Headers - convert to bold with newline
    .replace(/^#{1,6}\s+(.+)$/gm, '\n<b>$1</b>')
    // Bullet points - cleaner bullets
    .replace(/^(\s*)[-*]\s+/gm, '$1• ')
    // Numbered lists - keep numbers for clarity
    .replace(/^(\s*)(\d+)\.\s+/gm, '$1$2. ')
    // Horizontal rules
    .replace(/^[-*_]{3,}$/gm, '───────────')
    // Clean up any remaining excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Final cleanup: remove any leftover raw pipe-only lines or table separators
  text = text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Remove lines that are just pipes and dashes (table separators)
      if (/^[\|\-\s:]+$/.test(trimmed) && trimmed.includes('|')) return false;
      // Remove lines that are just dashes (leftover separators)
      if (/^[-─]+$/.test(trimmed)) return false;
      return true;
    })
    .join('\n');

  // Clean up spacing around formatted entries
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  return text;
};

// Format calendar/event entries more nicely
const formatCalendarEntry = (title, date, status) => {
  const statusEmoji = status?.toLowerCase().includes('accept') ? '✅' :
                      status?.toLowerCase().includes('decline') ? '❌' :
                      status?.toLowerCase().includes('tentative') ? '❓' : '📅';
  return `${statusEmoji} <b>${title}</b>\n   📆 ${date}\n   ${status}`;
};

// Check if a line is a table separator (|---|---|)
const isTableSeparator = (line) => {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  // Remove pipes, dashes, colons, and spaces - if nothing left, it's a separator
  const remaining = trimmed.replace(/[\|\-:\s]/g, '');
  return remaining.length === 0;
};

// Check if a line looks like a table row
const isTableRow = (line) => {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparator(line)) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  // Need at least 1 pipe for a valid table row
  return pipeCount >= 1;
};

// Parse a table row into cells
const parseTableRow = (row) => {
  let cleaned = row.trim();
  if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
  return cleaned.split('|').map(cell => cell.trim());
};

// Convert markdown tables to a cleaner readable format
const convertTablesToReadable = (text) => {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this looks like a table row or separator
    if (isTableRow(line) || isTableSeparator(line)) {
      const tableLines = [];
      let hasHeader = false;
      let headerLine = null;

      // Collect all consecutive table-related lines
      while (i < lines.length) {
        const currentLine = lines[i];
        if (isTableSeparator(currentLine)) {
          // If we have collected lines before separator, first one is header
          if (tableLines.length === 1 && !hasHeader) {
            hasHeader = true;
            headerLine = tableLines[0];
            tableLines.length = 0; // Clear - we'll only keep data rows
          }
          i++;
          continue;
        }
        if (isTableRow(currentLine)) {
          tableLines.push(currentLine.trim());
          i++;
        } else {
          break;
        }
      }

      // Process the table
      if (tableLines.length > 0 || headerLine) {
        const headers = headerLine ? parseTableRow(headerLine) : null;
        const dataRows = tableLines.map(l => parseTableRow(l));

        // If no separator found, check if first row looks like headers
        if (!headers && dataRows.length > 1) {
          const firstRow = dataRows[0];
          const looksLikeHeader = firstRow.some(h =>
            /^(event|date|status|name|title|id|type|time|description|value|action|result|count|total|item|category)$/i.test(h)
          );
          if (looksLikeHeader) {
            const headerRow = dataRows.shift();
            result.push('');
            for (let idx = 0; idx < dataRows.length; idx++) {
              const row = dataRows[idx];
              const entryLines = [];
              if (row[0]) {
                entryLines.push(`▸ <b>${row[0]}</b>`);
              }
              for (let j = 1; j < row.length && j < headerRow.length; j++) {
                const value = row[j] || '';
                const header = headerRow[j] || '';
                if (value) {
                  entryLines.push(`   ${header}: ${value}`);
                }
              }
              result.push(entryLines.join('\n'));
              if (idx < dataRows.length - 1) result.push('');
            }
            result.push('');
            continue;
          }
        }

        if (headers && dataRows.length > 0) {
          result.push(''); // spacing before table

          // Check if this looks like a calendar/event table
          const isCalendarTable = headers.some(h =>
            /^(event|date|status|time)$/i.test(h)
          );

          for (let idx = 0; idx < dataRows.length; idx++) {
            const row = dataRows[idx];
            const entryLines = [];

            if (isCalendarTable) {
              // Special formatting for calendar entries
              const eventName = row[0] || '';
              const dateIdx = headers.findIndex(h => /date|time/i.test(h));
              const statusIdx = headers.findIndex(h => /status/i.test(h));
              const date = dateIdx > 0 ? row[dateIdx] : '';
              const status = statusIdx > 0 ? row[statusIdx] : '';

              // Determine emoji based on status
              const emoji = status.toLowerCase().includes('accept') ? '✅' :
                           status.toLowerCase().includes('decline') ? '❌' :
                           status.toLowerCase().includes('tentative') ? '❓' : '📅';

              entryLines.push(`${emoji} <b>${eventName}</b>`);
              if (date) entryLines.push(`     📆 ${date}`);
              // Add other fields except event name, date, and status
              for (let j = 1; j < row.length && j < headers.length; j++) {
                if (j === dateIdx || j === statusIdx) continue;
                const value = row[j] || '';
                const header = headers[j] || '';
                if (value) entryLines.push(`     ${header}: ${value}`);
              }
            } else {
              // Default formatting
              if (row[0]) {
                entryLines.push(`▸ <b>${row[0]}</b>`);
              }
              for (let j = 1; j < row.length && j < headers.length; j++) {
                const value = row[j] || '';
                const header = headers[j] || '';
                if (value) {
                  entryLines.push(`   ${header}: ${value}`);
                }
              }
            }

            result.push(entryLines.join('\n'));
            if (idx < dataRows.length - 1) result.push('');
          }
          result.push(''); // spacing after table
        } else {
          // No header - format as simple list items
          for (const row of dataRows) {
            const cells = row.filter(c => c);
            if (cells.length > 0) {
              const [first, ...rest] = cells;
              if (rest.length > 0) {
                result.push(`▸ <b>${first}</b>: ${rest.join(' · ')}`);
              } else {
                result.push(`▸ ${first}`);
              }
            }
          }
        }
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
};

// Remove any raw markdown table remnants that slipped through
const cleanTableRemnants = (text) => {
  return text
    .split('\n')
    .map(line => {
      // If line contains pipes and looks like a table row, clean it up
      if (line.includes('|') && !line.includes('<')) {
        // Extract content between pipes
        const cells = parseTableRow(line).filter(c => c.trim());
        if (cells.length > 0) {
          // Format as a clean line
          return cells.join(' · ');
        }
        return ''; // Remove empty table lines
      }
      return line;
    })
    .filter(line => {
      const trimmed = line.trim();
      // Remove pure separator lines
      if (/^[\|\-\s:─]+$/.test(trimmed) && trimmed.length > 2) return false;
      return true;
    })
    .join('\n');
};

module.exports = { isUserAllowed, splitMessage, markdownToHtml, formatCalendarEntry };
