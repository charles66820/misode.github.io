import { DataModel, ModelPath } from '@mcschema/core'
import json from 'comment-json'
import yaml from 'js-yaml'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { Btn, BtnMenu } from '..'
import { useModel } from '../../hooks'
import { locale } from '../../Locales'
import { transformOutput } from '../../schema/transformOutput'
import type { BlockStateRegistry } from '../../services'
import { Store } from '../../Store'
import { message } from '../../Utils'

const OUTPUT_CHARS_LIMIT = 10000

const INDENT: Record<string, number | string | undefined> = {
	'2_spaces': 2,
	'4_spaces': 4,
	tabs: '\t',
	minified: undefined,
}

const FORMATS: Record<string, {
	parse: (v: string) => any,
	stringify: (v: any, indentation: string | number | undefined) => string,
}> = {
	json: {
		parse: json.parse,
		stringify: (v, i) => json.stringify(v, null, i),
	},
	yaml: {
		parse: yaml.load,
		stringify: (v, i) => yaml.dump(v, {
			flowLevel: i === undefined ? 0 : -1,
			indent: typeof i === 'string' ? 4 : i,
		}),
	},
}

type SourcePanelProps = {
	lang: string,
	name: string,
	model: DataModel | null,
	blockStates: BlockStateRegistry | null,
	doCopy?: number,
	doDownload?: number,
	doImport?: number,
	copySuccess: () => unknown,
	onError: (message: string) => unknown,
}
export function SourcePanel({ lang, name, model, blockStates, doCopy, doDownload, doImport, copySuccess, onError }: SourcePanelProps) {
	const loc = locale.bind(null, lang)
	const [indent, setIndent] = useState(Store.getIndent())
	const [format, setFormat] = useState(Store.getFormat())
	const source = useRef<HTMLTextAreaElement>(null)
	const download = useRef<HTMLAnchorElement>(null)
	const retransform = useRef<Function>()

	const getOutput = useCallback((model: DataModel, blockStates: BlockStateRegistry) => {
		const data = model.schema.hook(transformOutput, new ModelPath(model), model.data, { blockStates })
		return FORMATS[format].stringify(data, INDENT[indent]) + '\n'
	}, [indent, format])

	useEffect(() => {
		retransform.current = () => {
			if (!model || !blockStates) return
			try {
				const output = getOutput(model, blockStates)
				if (output.length >= OUTPUT_CHARS_LIMIT) {
					source.current.value = output.slice(0, OUTPUT_CHARS_LIMIT) + `\n\nOutput is too large to display (+${OUTPUT_CHARS_LIMIT} chars)\nExport to view complete output\n\n`
				} else {
					source.current.value = output
				}
			} catch (e) {
				onError(`Error getting JSON output: ${message(e)}`)
				console.error(e)
				source.current.value = ''
			}
		}
	})

	useModel(model, () => {
		retransform.current()
	})
	useEffect(() => {
		if (model) retransform.current()
	}, [model])

	useEffect(() => {
		retransform.current()
	}, [indent, format])

	const onImport = () => {
		if (source.current.value.length === 0) return
		try {
			const data = FORMATS[format].parse(source.current.value)
			model?.reset(DataModel.wrapLists(data), false)
		} catch (e) {
			onError(`Error importing: ${message(e)}`)
			console.error(e)
		}
	}

	useEffect(() => {
		if (doCopy && model && blockStates) {
			navigator.clipboard.writeText(getOutput(model, blockStates)).then(() => {
				copySuccess()
			})
		}
	}, [doCopy])

	useEffect(() => {
		if (doDownload && model && blockStates && download.current) {
			const content = encodeURIComponent(getOutput(model, blockStates))
			download.current.setAttribute('href', `data:text/json;charset=utf-8,${content}`)
			download.current.setAttribute('download', `${name}.${format}`)
			download.current.click()
		}
	}, [doDownload])

	useEffect(() => {
		if (doImport && source.current) {
			source.current.value = ''
			source.current.select()
		}
	}, [doImport])

	const changeIndent = (value: string) => {
		Store.setIndent(value)
		setIndent(value)
	}

	const changeFormat = (value: string) => {
		Store.setFormat(value)
		setFormat(value)
	}

	return <> 
		<div class="controls">
			<BtnMenu icon="gear" tooltip={loc('output_settings')}>
				{Object.entries(INDENT).map(([key]) =>
					<Btn label={loc(`indentation.${key}`)} active={indent === key}
						onClick={() => changeIndent(key)}/>
				)}
				<hr />
				{Object.keys(FORMATS).map(key =>
					<Btn label={loc(`format.${key}`)} active={format === key}
						onClick={() => changeFormat(key)} />)}
			</BtnMenu>
		</div>
		<textarea ref={source} class="source" onBlur={onImport} spellcheck={false} autocorrect="off" placeholder={loc('source_placeholder')}></textarea>
		<a ref={download} style="display: none;"></a>
	</>
}
