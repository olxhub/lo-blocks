// PEG grammar for parsing ID lists
// Accepts comma, space, tab, and newline as delimiters
// Example: "id1, id2, id3" or "id1\nid2\nid3" or "id1 id2 id3"

{
  // Helper to filter out empty strings
  function filterEmpty(arr) {
    return arr.filter(id => id && id.trim().length > 0);
  }
}

start
  = ids:idList { return filterEmpty(ids); }

idList
  = first:id rest:(delimiter+ id)* delimiter* {
      return [first, ...rest.map(r => r[1])];
    }
  / delimiter* { return []; }

id
  = chars:[^ ,\t\n\r]+ { return chars.join('').trim(); }

delimiter
  = [ ,\t\n\r]+
