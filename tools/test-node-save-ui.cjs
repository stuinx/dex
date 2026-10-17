const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../resource/client/ui-web/nodes.php'), 'utf8');
const body = source.split("$('#buttonSaveNode').click(function(){")[1].split('</script>')[0].replace(/\n\}\)\n\}\)\s*$/, '');
for (const success of [false, true]) {
  const state = {error: '', visible: false, loading: false};
  const fields = ['1', 'example.com:443', 'fixture', '00000000-0000-4000-8000-000000000001', '/test'];
  const cell = index => ({find: kind => ({val: () => kind === 'button' ? 'example.com' : fields[index]})});
  const row = {find: () => ({eq: cell})};
  const error = {hide() {state.visible = false; return this;}, text(v) {state.error = v; return this;}, show() {state.visible = true; return this;}};
  const spinner = {attr() {state.loading = true;}, removeClass() {state.loading = false;}};
  const $ = selector => selector === '#nodeSaveError' ? error : selector === '#buttonSaveNodeLoading' ? spinner : selector === '#nodeTable' ? {children: () => ({eq: () => row})} : {length: 1};
  $.trim = value => value.trim();
  $.get = (url, payload) => {
    assert.equal(payload.nodeList[0].protocol, 'vless');
    assert.equal(payload.nodeList[0].path, '/test');
    return {done(callback) {if (success) callback(''); return this;}, fail(callback) {if (!success) callback({responseText: 'Node 1: invalid UUID'}); return this;}};
  };
  const window = {location: {href: 'nodes.php'}};
  vm.runInNewContext(body, {$, window});
  assert.equal(state.loading, false);
  assert.equal(window.location.href, success ? 'index.php' : 'nodes.php');
  if (!success) {
    assert.equal(state.error, 'Node 1: invalid UUID');
    assert.equal(state.visible, true);
    assert.equal(fields[1], 'example.com:443');
  }
}
console.log('PASS: real node-save handler sends VLESS, preserves failure page and displays error; success redirects');
