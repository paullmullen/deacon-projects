'use strict';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(value) {
  const pattern=/(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let result='',cursor=0;
  for(const match of value.matchAll(pattern)) {
    result+=escapeHtml(value.slice(cursor,match.index));
    if(match[2]) {
      const url=match[3].trim();
      result+=/^(https?:\/\/|mailto:)/i.test(url)
        ? `<a href="${escapeHtml(url)}" style="color:#245b85;text-decoration:underline;">${escapeHtml(match[2])}</a>` : escapeHtml(match[0]);
    } else if(match[4]) result+=`<strong>${escapeHtml(match[4])}</strong>`;
    else if(match[5]) result+=`<em>${escapeHtml(match[5])}</em>`;
    else result+=`<code>${escapeHtml(match[6])}</code>`;
    cursor=match.index+match[0].length;
  }
  return result+escapeHtml(value.slice(cursor));
}
function emailMarkdown(value) {
  const lines=String(value || '').trim().split(/\r?\n/);
  const blocks=[];
  let i=0;
  const isList=line=>/^\s*(?:[-*+]\s+|\d+\.\s+).+$/.test(line);
  while(i<lines.length) {
    if(!lines[i].trim()){i++;continue;}
    const heading=/^(#{1,3})\s+(.+)$/.exec(lines[i]);
    if(heading){blocks.push(`<h${heading[1].length+2} style="margin:12px 0 8px;font-size:17px;line-height:1.4;">${inline(heading[2])}</h${heading[1].length+2}>`);i++;continue;}
    if(isList(lines[i])) {
      const numbered=/^\s*\d+\.\s+/.test(lines[i]);
      const regex=numbered?/^\s*\d+\.\s+(.+)$/:/^\s*[-*+]\s+(.+)$/;
      const items=[];
      while(i<lines.length&&regex.test(lines[i])){items.push(`<li style="margin:0 0 5px;">${inline(lines[i].match(regex)[1])}</li>`);i++;}
      const tag=numbered?'ol':'ul';blocks.push(`<${tag} style="padding-left:22px;margin:8px 0 12px;">${items.join('')}</${tag}>`);continue;
    }
    const paragraph=[];
    while(i<lines.length&&lines[i].trim()&&!/^(#{1,3})\s+(.+)$/.test(lines[i])&&!isList(lines[i]))paragraph.push(lines[i++].trim());
    blocks.push(`<p style="margin:0 0 12px;">${inline(paragraph.join(' '))}</p>`);
  }
  return blocks.join('');
}
module.exports={emailMarkdown};
