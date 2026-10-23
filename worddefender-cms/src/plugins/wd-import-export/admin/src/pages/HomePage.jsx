import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetchClient, useNotification, Layouts, Page } from '@strapi/strapi/admin';
import {
  Box,
  Button,
  Divider,
  Field,
  Flex,
  Loader,
  Main,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Textarea,
  Typography,
} from '@strapi/design-system';
import { Download, Upload } from '@strapi/icons';

const PLUGIN_URL = '/wd-import-export';

/** Tải nội dung export về máy mà không cần endpoint tải riêng. */
const downloadFile = (filename, mime, content) => {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const HomePage = () => {
  const { get, post } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [types, setTypes] = useState(null);
  const [uid, setUid] = useState('');
  const [format, setFormat] = useState('json');
  const [keyField, setKeyField] = useState('id');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    get(`${PLUGIN_URL}/content-types`)
      .then(({ data }) => {
        setTypes(data.data);
        if (data.data.length) setUid(data.data[0].uid);
      })
      .catch((e) => toggleNotification({ type: 'danger', message: `Không đọc được danh sách content type: ${e.message}` }));
  }, [get, toggleNotification]);

  const current = useMemo(() => types?.find((t) => t.uid === uid) ?? null, [types, uid]);

  // Khóa đối chiếu phải thuộc content type đang chọn, nếu không lần sau bấm sẽ lỗi.
  useEffect(() => {
    if (current && !current.keyFields.includes(keyField)) setKeyField('id');
  }, [current, keyField]);

  const notifyError = (e) =>
    toggleNotification({ type: 'danger', message: e.response?.data?.error ?? e.message ?? 'Có lỗi xảy ra' });

  const handleExport = async () => {
    setBusy('export');
    try {
      const { data } = await post(`${PLUGIN_URL}/export`, { uid, format });
      const { filename, mime, content: body, count } = data.data;
      downloadFile(filename, mime, body);
      toggleNotification({ type: 'success', message: `Đã xuất ${count} bản ghi ra ${filename}` });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy('');
    }
  };

  const handleImport = async (dryRun) => {
    setBusy(dryRun ? 'check' : 'import');
    setReport(null);
    try {
      const { data } = await post(`${PLUGIN_URL}/import`, { uid, format, content, keyField, dryRun });
      const r = data.data;
      setReport(r);
      toggleNotification({
        type: r.failures.length ? 'warning' : 'success',
        message: dryRun
          ? `Kiểm tra xong: ${r.created} thêm mới, ${r.updated} cập nhật, ${r.failures.length} lỗi`
          : `Đã nạp: ${r.created} thêm mới, ${r.updated} cập nhật, ${r.failures.length} lỗi`,
      });
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy('');
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.csv')) setFormat('csv');
    if (file.name.endsWith('.json')) setFormat('json');
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  if (!types) {
    return (
      <Page.Main>
        <Flex justifyContent="center" padding={10}>
          <Loader>Đang tải…</Loader>
        </Flex>
      </Page.Main>
    );
  }

  return (
    <Main>
      <Layouts.Header
        title="Import / Export"
        subtitle="Xuất nội dung ra JSON hoặc CSV, và nạp lại từ file. Nạp lại cùng một file sẽ cập nhật bản ghi cũ thay vì tạo trùng."
      />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
            <Flex gap={4} alignItems="flex-end" wrap="wrap">
              <Box minWidth="260px">
                <Field.Root name="uid">
                  <Field.Label>Content type</Field.Label>
                  <SingleSelect value={uid} onChange={setUid}>
                    {types.map((t) => (
                      <SingleSelectOption key={t.uid} value={t.uid}>
                        {`${t.displayName} (${t.uid})`}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Field.Root>
              </Box>
              <Box minWidth="160px">
                <Field.Root name="format">
                  <Field.Label>Định dạng</Field.Label>
                  <SingleSelect value={format} onChange={setFormat}>
                    <SingleSelectOption value="json">JSON</SingleSelectOption>
                    <SingleSelectOption value="csv">CSV</SingleSelectOption>
                  </SingleSelect>
                </Field.Root>
              </Box>
              <Button
                onClick={handleExport}
                startIcon={<Download />}
                loading={busy === 'export'}
                disabled={Boolean(busy) || !uid}
              >
                Xuất file
              </Button>
            </Flex>
          </Box>

          <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Typography variant="delta">Nạp dữ liệu</Typography>

              <Flex gap={4} alignItems="flex-end" wrap="wrap">
                <Box minWidth="220px">
                  <Field.Root
                    name="keyField"
                    hint="Trường dùng để nhận ra bản ghi đã có. Trùng thì cập nhật, không trùng thì tạo mới."
                  >
                    <Field.Label>Khóa đối chiếu</Field.Label>
                    <SingleSelect value={keyField} onChange={setKeyField}>
                      {(current?.keyFields ?? ['id']).map((f) => (
                        <SingleSelectOption key={f} value={f}>
                          {f}
                        </SingleSelectOption>
                      ))}
                    </SingleSelect>
                    <Field.Hint />
                  </Field.Root>
                </Box>
                <Box>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                  />
                  <Button variant="tertiary" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
                    Chọn file…
                  </Button>
                </Box>
              </Flex>

              <Field.Root name="content">
                <Field.Label>Nội dung file</Field.Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  placeholder={'JSON: [ { "headword": "ball", "meaningVi": "quả bóng" } ]\nhoặc CSV có dòng tiêu đề'}
                />
              </Field.Root>

              <Flex gap={2}>
                <Button
                  variant="secondary"
                  onClick={() => handleImport(true)}
                  loading={busy === 'check'}
                  disabled={Boolean(busy) || !content.trim()}
                >
                  Kiểm tra trước
                </Button>
                <Button
                  startIcon={<Upload />}
                  onClick={() => handleImport(false)}
                  loading={busy === 'import'}
                  disabled={Boolean(busy) || !content.trim()}
                >
                  Nạp vào CMS
                </Button>
              </Flex>
            </Flex>
          </Box>

          {report && (
            <Box background="neutral0" padding={6} hasRadius shadow="tableShadow">
              <Flex direction="column" alignItems="stretch" gap={3}>
                <Typography variant="delta">
                  {report.dryRun ? 'Kết quả kiểm tra (chưa ghi gì)' : 'Kết quả nạp'}
                </Typography>
                <Typography textColor="neutral700">
                  {`${report.total} dòng · ${report.created} thêm mới · ${report.updated} cập nhật · ${report.failures.length} lỗi`}
                </Typography>
                {report.failures.length > 0 && (
                  <>
                    <Divider />
                    <Table colCount={3} rowCount={report.failures.length}>
                      <Thead>
                        <Tr>
                          <Th>
                            <Typography variant="sigma">Dòng</Typography>
                          </Th>
                          <Th>
                            <Typography variant="sigma">Bản ghi</Typography>
                          </Th>
                          <Th>
                            <Typography variant="sigma">Lý do</Typography>
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {report.failures.slice(0, 50).map((f, i) => (
                          <Tr key={`${f.line}-${i}`}>
                            <Td>
                              <Typography>{f.line}</Typography>
                            </Td>
                            <Td>
                              <Typography>{f.label ?? f.key ?? '—'}</Typography>
                            </Td>
                            <Td>
                              <Typography textColor="danger600">{f.error}</Typography>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {report.failures.length > 50 && (
                      <Typography textColor="neutral600">{`… và ${report.failures.length - 50} dòng nữa`}</Typography>
                    )}
                  </>
                )}
              </Flex>
            </Box>
          )}
        </Flex>
      </Layouts.Content>
    </Main>
  );
};

export { HomePage };
