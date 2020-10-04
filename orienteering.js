//
// Functionality for elaborating with data from WinSplits Online.
//

'use strict';

const orienteering = (() => {

    console.log('Initializing orienteering functionality...');

    const version = '1.5.0';
    const MISSING_TIME = -1;
    const NO_PLACE = -1;

    const toSeconds = hh_mm_ss => {
        // The formats from WinSplits Online are either "h:mm.ss" or "m.ss".

        if (hh_mm_ss === '') {
            return MISSING_TIME;
        }

        let hours = 0;
        let mm_ss = null;

        if (hh_mm_ss.includes(':')) {
            const hoursAndMinutesSeconds = hh_mm_ss.split(':');

            hours = Number.parseInt(hoursAndMinutesSeconds[0], 10);
            mm_ss = hoursAndMinutesSeconds[1];
        } else {
            mm_ss = hh_mm_ss;
        }

        const minutesAndSeconds = mm_ss.split('.');

        const minutes = Number.parseInt(minutesAndSeconds[0], 10);
        const seconds = Number.parseInt(minutesAndSeconds[1], 10);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        return totalSeconds;
    };

    const zeroPad = n => (n < 10 ? '0' : '') + n;

    const formatTime = (totalSeconds, minimum = 'seconds', doubleDigits = false) => {

        let result = '';

        if (totalSeconds === MISSING_TIME) {
            return '';
        }

        let rest = totalSeconds;

        const mandatoryHours = minimum === 'hours';
        const mandatoryMinutes = mandatoryHours || minimum === 'minutes';

        if (mandatoryHours || rest >= 3600) {
            const hours = Math.floor(rest / 3600);
            rest -= hours * 3600;
            result += doubleDigits || result.length > 0 ? `${zeroPad(hours)}:` : `${hours}:`;
            // result += `${hours}:`;
        }
        if (mandatoryMinutes || rest >= 60 || result.length > 0) {
            const minutes = Math.floor(rest / 60);
            rest -= minutes * 60;
            result += doubleDigits || result.length > 0 ? `${zeroPad(minutes)}:` : `${minutes}:`;
        }
        result += doubleDigits || result.length > 0 ? zeroPad(rest) : rest;

        return result;
    };

    const createPerformanceContainer = () => {
        return {
            originalTime: null, // Format 'hh:mm.ss'.
            relativeTime: null,
            relativeTimeInSeconds: null,
            relativeTimeMinimized: null,
            actualTime: null,
            actualTimeInSeconds: null,
            actualTimeMinimized: null,
            place: null
        };
    };

    const createEmptyLegOrSplitWrapper = () => {
        return {
            relativeTimes: [], // Original value read from WinSplits. TODO Inte alltid originalvärden, kan vara actual också.
            relativeTimesInSeconds: [],
            relativeTimesMinimized: [], // Format: h:m:s.
            places: [],
            timesPercentages: [],
            actualTimes: [],
            actualTimesInSeconds: [],
            actualTimesMinimized: [] // Format: h:m:s.
        }
    };

    const createEmptyControl = (n = 999) => {
        return {
            // control: n === 999 ? 'Finish' : 'Control ' + n,
            control: n === 999 ? 'Finish' : n,
            leg: createPerformanceContainer(),
            split: createPerformanceContainer()
        };
    };

    const createEmptyControls = numberOfControls => {
        const controls = [];

        // controls.push('Start');

        for (let control = 1; control <= numberOfControls; control++) {
            controls.push(createEmptyControl(control));
        }
        controls.push(createEmptyControl()); // Finish.

        return controls;
    };

    const createControlLabels = numberOfControls => {
        const controls = [];

        controls.push('Start');

        for (let control = 1; control <= numberOfControls; control++) {
            controls.push(`Control ${control}`);
        }

        controls.push('Finish');
        // controls[controls.length - 1] = 'Finish'; // Rename last control to 'Finish'.
        return controls;
    };

    const getPlace = placeStr => placeStr === '' ? NO_PLACE : parseInt(placeStr.substring(1, placeStr.length - 1), 10); // '(12)' => 12.

    const nextPart = (parseWrapper) => parseWrapper.parts[parseWrapper.index++];

    const calculateActualTimesFromRelativeTimes = (orienteeringData, athlete, control, type) => {
        // Calculate actual times (from the defined relative times and best times).
        const legOrSplit = control[type];

        const index = control.control === 'Finish' ? orienteeringData.numberOfControls : control.control - 1;

        legOrSplit.actualTimeInSeconds = orienteeringData.best[type].timesInSeconds[index] + legOrSplit.relativeTimeInSeconds;
        // console.log(`Calculating control ${control.control}`, orienteeringData.best[type].timesInSeconds[index], legOrSplit.relativeTimeInSeconds, legOrSplit.actualTimeInSeconds);

        legOrSplit.actualTime = formatTime(legOrSplit.actualTimeInSeconds);
    };

    const calculateRelativeTimesFromActualTimes = (orienteeringData, athlete, control, type) => {
        // Calculate relative times (from the defined actual times and best times).
        const legOrSplit = control[type];

        const index = control.control === 'Finish' ? orienteeringData.numberOfControls : control.control - 1;

        legOrSplit.relativeTimeInSeconds = legOrSplit.actualTimeInSeconds - orienteeringData.best[type].timesInSeconds[index];
        // console.log(`Calculating control ${control.control}`, legOrSplit.actualTimeInSeconds, orienteeringData.best[type].timesInSeconds[index], legOrSplit.relativeTimeInSeconds);

        legOrSplit.relativeTime = formatTime(legOrSplit.relativeTimeInSeconds);
    };

    const extractTimeInformationForAthlete = (parseWrapper, configuration) => (type) => {

        // Loop all controls plus finish.
        for (let control = 1; control <= parseWrapper.numberOfControls + 1; control++) {
            const currentControl = parseWrapper.athlete.controls[control - 1];
            const legOrSplit = currentControl[type];
            const relativeOrActualTime = nextPart(parseWrapper);
            const place = getPlace(nextPart(parseWrapper));

            legOrSplit.originalTime = relativeOrActualTime;
            legOrSplit.place = place;
            if (configuration.typeOfTimeDataToParse === 'RELATIVE') {
                legOrSplit.relativeTime = relativeOrActualTime;
                legOrSplit.relativeTimeInSeconds =
                    place === 1 ? 0 : toSeconds(relativeOrActualTime);
            } else {
                legOrSplit.actualTime = relativeOrActualTime;
                legOrSplit.actualTimeInSeconds = toSeconds(relativeOrActualTime);
            }

            if (place === 1) {
                parseWrapper.orienteeringData.best[type].timesOriginal[control - 1] = relativeOrActualTime;
                parseWrapper.orienteeringData.best[type].times[control - 1] = formatTime(toSeconds(relativeOrActualTime), 'minutes');
                parseWrapper.orienteeringData.best[type].timesInSeconds[control - 1] = toSeconds(relativeOrActualTime);
            }
        }
    };

    const parseSplitTimesExportedAsText = (rawData, configuration) => {

        // Notes 2020-06-06.
        //
        // Make sure the checkboxes for "relative split times" and "relative total times" are checked,
        // before "export the split times in text format".
        //
        // Formats for WinSplits exported text files are as follows for every two lines:
        // Pos<tab>Name<tab>Finish time<tab>Diff<tab><Start-Controls-Finish><tab>Name<tab><newline>
        // <tab>Club<tab><tab><tab><Start-Controls-Finish><tab>Club<tab><newline>

        // Notes 2020-10-04.
        //
        // Now you can also import formats that consist of actual split times, so you don't need to export
        // with relative times.

        console.log('[Step 1] Parsing WinSplits Online exported data...');

        const typeOfData = configuration.typeOfTimeDataToParse + ' times';
        console.log(`Parsing ${typeOfData}`);

        const orienteeringData = {
            numberOfParticipants: 0,
            numberOfControls: 0,
            controlLabels: [],
            best: { // Per control and 'Finish', i.e. length is numberOfControls + 1.
                leg: {
                    timesOriginal: [],
                    times: [],
                    timesInSeconds: [],
                },
                split: {
                    timesOriginal: [],
                    times: [],
                    timesInSeconds: [],
                },
            },
            secondBest: {
                leg: {
                    relativeTimesInSeconds: []
                },
                split: {
                    relativeTimesInSeconds: []
                }
            },
            aggregated: { // Per athlete, i.e. length is numberOfAthletes.
                names: [],
                place: {
                    legFirstPlaces: [],
                    legSecondPlaces: [],
                    legThirdPlaces: [],
                    leg4_6Places: [],
                    leg7_12Places: [],
                },
                mistake: {
                    legNoMistakes: [],
                    legMinorMistakes: [],
                    legMajorMistakes: [],
                }
            },
        };

        const lines = rawData.split('\n');
        // console.log('lines.length', lines.length);

        let firstRowForAthlete = true;
        let athlete = null;
        const athletes = [];

        const parseWrapper = {
            orienteeringData,
            numberOfControls: null,
            parts: null,
            index: 0,
            athlete: null
        };

        let lineCount = 0;

        for (let line of lines) {
            // console.log('line', line);
            const parts = line.split('\t');
            // console.log('parts.length', parts.length);
            const numberOfControls = (parts.length - 8) / 2;
            // console.log('numberOfControls', numberOfControls);

            if (numberOfControls <= 0) {
                // console.log('Skipping row that contains no useful data');
                continue;
            }

            lineCount++;

            if (lineCount <= 2) {
                // console.log('Skipping header row');
                continue;
            }

            if (numberOfControls > 0 && orienteeringData.numberOfControls === 0) {
                // console.log('Found number of controls', numberOfControls);
                orienteeringData.numberOfControls = numberOfControls;
                orienteeringData.controlLabels = createControlLabels(numberOfControls);
                parseWrapper.numberOfControls = numberOfControls;
            }

            parseWrapper.parts = parts;

            // console.log('parts', parts);

            // let index = 0;

            if (firstRowForAthlete) {
                athlete = {
                    position: nextPart(parseWrapper),
                    name: nextPart(parseWrapper),
                    club: null,
                    totalTime: nextPart(parseWrapper),
                    diffTotalTime: nextPart(parseWrapper),
                    controls: createEmptyControls(numberOfControls),
                    leg: createEmptyLegOrSplitWrapper(),
                    split: createEmptyLegOrSplitWrapper()
                };

                parseWrapper.athlete = athlete;

                extractTimeInformationForAthlete(parseWrapper, configuration)('leg');

            } else {
                parseWrapper.index++;
                athlete.club = nextPart(parseWrapper);
                parseWrapper.index += 2;

                extractTimeInformationForAthlete(parseWrapper, configuration)('split');
            }

            {
                // Sanity checks.

                const nameOrClub = nextPart(parseWrapper);

                const correctStructure = parseWrapper.index === parts.length - 1;

                const correctHeadTailFirstRow = firstRowForAthlete && nameOrClub === athlete.name;

                const correctHeadTailSecondRow = !firstRowForAthlete && nameOrClub === athlete.club;

                if (!(correctStructure && (correctHeadTailFirstRow || correctHeadTailSecondRow))) {
                    console.log('MISMATCH!!!!');
                }
            }

            if (!firstRowForAthlete) {
                // console.log('athlete', athlete);

                {
                    // Fix original values.
                    athlete.position = athlete.position === '' ? NO_PLACE : parseInt(athlete.position, 10);
                    if (!['dsq', 'mp', 'dns'].includes(athlete.totalTime)) {
                        athlete.totalTime = formatTime(toSeconds(athlete.totalTime));
                    }
                    if (athlete.diffTotalTime !== '') {
                        athlete.diffTotalTime = '+' + formatTime(toSeconds(athlete.diffTotalTime), 'minutes');
                    }
                }

                athletes.push(athlete);
                athlete = null;
                orienteeringData.numberOfParticipants++;
            }

            firstRowForAthlete = !firstRowForAthlete;
            parseWrapper.index = 0;
        }



        orienteeringData.results = athletes;
        console.log('[Step 1] Parsing WinSplits Online exported data - DONE');

        return orienteeringData;
    };

    const isMistake = (bestLegTimesInSeconds, percentage) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isMistake = relativeLegTimeInSeconds > (bestLegTimeInSeconds * percentage / 100);
        return isMistake;
    };

    const isWithinPercentage = (bestLegTimesInSeconds, minIncluded, maxExcluded) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isWithin = relativeLegTimeInSeconds >= bestLegTimeInSeconds * minIncluded / 100 && relativeLegTimeInSeconds < bestLegTimeInSeconds * maxExcluded / 100;
        return isWithin;
    };

    const isAbovePercentage = (bestLegTimesInSeconds, minIncluded) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];
        const isAbove = relativeLegTimeInSeconds >= bestLegTimeInSeconds * minIncluded / 100;
        return isAbove;
    };

    const roundToOneDecimal = x => Math.round( x * 10) / 10;

    const calculateMistakeInPercentage = (bestLegTimesInSeconds) => (relativeLegTimeInSeconds, index) => {
        const bestLegTimeInSeconds = bestLegTimesInSeconds[index];

        const percentage = roundToOneDecimal(relativeLegTimeInSeconds * 100 / bestLegTimeInSeconds);
        return percentage;
    };

    const interestingAthlete = athlete => false && athlete.position > 0 && athlete.position <= 2;

    const calculateActualAndRelativeTimesFromParsedInformation = (orienteeringData, configuration) => {
        console.log('[Step 2] Calculating additional time information from parsed data...');

        const parsingRelativeTimes = configuration.typeOfTimeDataToParse === 'RELATIVE';
        const typeOfData = configuration.typeOfTimeDataToParse + ' times';
        console.log(`Parsed data contains ${typeOfData} for ${orienteeringData.results.length} athletes and ${orienteeringData.numberOfControls} controls`);

        for (const athlete of orienteeringData.results) {
            if (interestingAthlete(athlete)) {
                console.log(`\n${athlete.position}: ${athlete.name} (${athlete.club})`);
                console.log('athlete', athlete);
            }

            for (const control of athlete.controls) {
                if (interestingAthlete(athlete)) {
                    console.log('');
                    console.log(`control ${control.control}: ${control.leg.originalTime} => ${control.split.originalTime}`);
                }

                if (parsingRelativeTimes) {
                    calculateActualTimesFromRelativeTimes(orienteeringData, athlete, control, 'leg');
                    calculateActualTimesFromRelativeTimes(orienteeringData, athlete, control, 'split');

                    if (interestingAthlete(athlete)) {
                        console.log(`CALCULATION DONE: control ${control.control}: ${control.leg.actualTime} => ${control.split.actualTime}`);
                        console.log('control', control);
                    }

                } else {
                    calculateRelativeTimesFromActualTimes(orienteeringData, athlete, control, 'leg');
                    calculateRelativeTimesFromActualTimes(orienteeringData, athlete, control, 'split');

                    if (interestingAthlete(athlete)) {
                        console.log(`CALCULATION DONE: control ${control.control}: ${control.leg.relativeTime} => ${control.split.relativeTime}`);
                        console.log('control', control);
                    }
                }
            }

            for (const type of ['leg', 'split']) {
                athlete[type].relativeTimes = athlete.controls.map(control => control[type].relativeTime);
                athlete[type].relativeTimesInSeconds = athlete.controls.map(control => control[type].relativeTimeInSeconds);
                athlete[type].places = athlete.controls.map(control => control[type].place);

                athlete[type].actualTimes = athlete.controls.map(control => control[type].actualTime);
                athlete[type].actualTimesInSeconds = athlete.controls.map(control => control[type].actualTimeInSeconds);
            }
        }

        console.log('[Step 2] Calculating additional time information from parsed data - DONE');
    };

    const enhanceOrienteeringDataForCharts = orienteeringData => {
        console.log('[Step 3] Enhancing data so it can be used together with charts...');

        const aggregated = orienteeringData.aggregated;
        const results = orienteeringData.results;

        const compareNumbers = (a, b) => {
            return a - b;
        };

        const sum = array => array.reduce((a, b) => a + b, 0);

        const average = array => sum(array) / array.length;

        const median = array => array.length % 2 === 0 ?
            (array[array.length / 2 - 1] + array[array.length / 2]) / 2 :
            array[Math.ceil(array.length / 2) - 1];

        const copyAndSort = array => array.slice().sort(compareNumbers);

        {
            const isPositive = n => n >= 0;

            for (let i = 0; i < orienteeringData.numberOfControls + 1; i++) {

                const relativeLegTimeInSecondsSortedAscending = results.map(athlete => athlete.leg.relativeTimesInSeconds[i])
                    .filter(isPositive)
                    .sort(compareNumbers);

                orienteeringData.secondBest.leg.relativeTimesInSeconds[i] = relativeLegTimeInSecondsSortedAscending;

                const relativeSplitTimeInSecondsSortedAscending = results.map(athlete => athlete.split.relativeTimesInSeconds[i])
                    .filter(isPositive)
                    .sort(compareNumbers);

                orienteeringData.secondBest.split.relativeTimesInSeconds[i] = relativeSplitTimeInSecondsSortedAscending;
            }
        }

        {
            // Calculate additional information.
            results.forEach(athlete => {
                athlete.controls.forEach((control, index) => {

                    const bestLegTimeInSeconds = orienteeringData.best.leg.timesInSeconds[index];
                    const bestSplitTimeInSeconds = orienteeringData.best.split.timesInSeconds[index];
                    const relativeLegTimeInSecondsSortedAscending = orienteeringData.secondBest.leg.relativeTimesInSeconds[index][1];
                    const relativeSplitTimeInSecondsSortedAscending = orienteeringData.secondBest.split.relativeTimesInSeconds[index][1];

                    const legTimeInSeconds = control.leg.relativeTimeInSeconds !== MISSING_TIME ? bestLegTimeInSeconds + control.leg.relativeTimeInSeconds : MISSING_TIME;
                    const splitTimeInSeconds = control.split.relativeTimeInSeconds !== MISSING_TIME ? bestSplitTimeInSeconds + control.split.relativeTimeInSeconds : MISSING_TIME;

                    control.leg.actualTimeMinimized = formatTime(legTimeInSeconds, 'minutes');
                    athlete.leg.actualTimesMinimized.push(control.leg.actualTimeMinimized);
                    control.split.actualTimeMinimized = formatTime(splitTimeInSeconds, 'minutes');
                    athlete.split.actualTimesMinimized.push(control.split.actualTimeMinimized);

                    const relativeLegTimeMinimized =
                        control.leg.relativeTimeInSeconds > 0 ?
                            '+' + formatTime(control.leg.relativeTimeInSeconds) :
                            control.leg.relativeTimeInSeconds === 0 ?
                                relativeLegTimeInSecondsSortedAscending > 0 ?
                                    '-' + formatTime(relativeLegTimeInSecondsSortedAscending) :
                                    0 :
                                null;
                    athlete.leg.relativeTimesMinimized.push(relativeLegTimeMinimized);
                    control.leg.relativeTimeMinimized = relativeLegTimeMinimized;

                    const relativeSplitTimeMinimized =
                        control.split.relativeTimeInSeconds > 0 ?
                            '+' + formatTime(control.split.relativeTimeInSeconds) :
                            control.split.relativeTimeInSeconds === 0 ?
                                relativeSplitTimeInSecondsSortedAscending > 0 ?
                                    '-' + formatTime(relativeSplitTimeInSecondsSortedAscending) :
                                    0 :
                                null;
                    athlete.split.relativeTimesMinimized.push(relativeSplitTimeMinimized);
                    control.split.relativeTimeMinimized = relativeSplitTimeMinimized;
                });

                // // Add 'Start' times for every athlete. NOT NEEDED!!!!
                // athlete.leg.relativeTimesInSeconds.unshift(0);
                // athlete.split.relativeTimesInSeconds.unshift(0);
            });
        }

        aggregated.names = results
            .map(athlete => athlete.name);

        const isMinorMistake = isMistake(orienteeringData.best.leg.timesInSeconds, 15);
        const isMajorMistake = isMistake(orienteeringData.best.leg.timesInSeconds, 30);

        // Enhancing results for each athlete.
        results.forEach(athlete => {

            athlete.additionals = {};

            athlete.additionals.legFirstPlace = athlete.leg.places
                .filter(legPlace => legPlace === 1)
                .length;

            athlete.additionals.legSecondPlace = athlete.leg.places
                .filter(legPlace => legPlace === 2)
                .length;

            athlete.additionals.legThirdPlace = athlete.leg.places
                .filter(legPlace => legPlace === 3)
                .length;

            athlete.additionals.leg4_6Place = athlete.leg.places
                .filter(legPlace => legPlace >= 4 && legPlace <= 6)
                .length;

            athlete.additionals.leg7_12Place = athlete.leg.places
                .filter(legPlace => legPlace >= 7 && legPlace <= 12)
                .length;

            athlete.additionals.legNoMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => !isMinorMistake(relativeLegTime, index) && !isMajorMistake(relativeLegTime, index))
                .length;

            athlete.additionals.legMinorMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => isMinorMistake(relativeLegTime, index) && !isMajorMistake(relativeLegTime, index))
                .length;

            athlete.additionals.legMajorMistake = athlete.leg.relativeTimesInSeconds
                .filter((relativeLegTime, index) => isMajorMistake(relativeLegTime, index))
                .length;

            {
                athlete.additionals.legWithin1Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 0, 1)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin2Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 1, 2)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin4Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 2, 4)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin8Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 4, 8)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin16Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 8, 16)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin32Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 16, 32)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin64Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 32, 64)(relativeLegTime, index))
                    .length;

                athlete.additionals.legWithin128Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isWithinPercentage(orienteeringData.best.leg.timesInSeconds, 64, 128)(relativeLegTime, index))
                    .length;

                athlete.additionals.legAbove128Percent = athlete.leg.relativeTimesInSeconds
                    .filter((relativeLegTime, index) => isAbovePercentage(orienteeringData.best.leg.timesInSeconds, 128)(relativeLegTime, index))
                    .length;
            }

            {
                athlete.split.times = athlete.split.relativeTimes
                    .map((relativeSplitTime, index) => {

                        const relativeSplitTimeInSeconds = athlete.split.relativeTimesInSeconds[index];

                        const splitTimeInSecondsForAthlete =
                            orienteeringData.best.split.timesInSeconds[index] +
                            relativeSplitTimeInSeconds;

                        const splitTimeStringForAthlete = relativeSplitTimeInSeconds >= 0 ?
                            formatTime(splitTimeInSecondsForAthlete, 'hours', true) :
                            null;

                        return {
                            t: splitTimeStringForAthlete,
                            y: index < orienteeringData.numberOfControls ? 'Control ' + (index + 1) : 'Finish'
                            // y: (index + 1)
                        }
                    });
            }

            {
                athlete.leg.timesPercentages = athlete.leg.relativeTimesInSeconds
                    .map((relativeLegTimeInSeconds, index) => {

                        return calculateMistakeInPercentage(orienteeringData.best.leg.timesInSeconds)(relativeLegTimeInSeconds, index);
                    });
            }

            {
                athlete.split.timesPercentages = athlete.split.relativeTimesInSeconds
                    .map((relativeSplitTimeInSeconds, index) => {

                        return calculateMistakeInPercentage(orienteeringData.best.split.timesInSeconds)(relativeSplitTimeInSeconds, index);
                    });
            }

            {
                // Calculate average and median for mistakes.

                const timesPercentagesSortedAscending = copyAndSort(athlete.leg.timesPercentages);

                athlete.leg.averagePercentageLoss = roundToOneDecimal(average(timesPercentagesSortedAscending));

                athlete.leg.medianPercentageLoss = median(timesPercentagesSortedAscending);
            }
        });

        aggregated.place.legFirstPlaces = results
            .map(athlete => athlete.additionals.legFirstPlace);

        aggregated.place.legSecondPlaces = results
            .map(athlete => athlete.additionals.legSecondPlace);

        aggregated.place.legThirdPlaces = results
            .map(athlete => athlete.additionals.legThirdPlace);

        aggregated.place.leg4_6Places = results
            .map(athlete => athlete.additionals.leg4_6Place);

        aggregated.place.leg7_12Places = results
            .map(athlete => athlete.additionals.leg7_12Place);

        aggregated.mistake.legNoMistakes = results
            .map(athlete => athlete.additionals.legNoMistake);

        aggregated.mistake.legMinorMistakes = results
            .map(athlete => athlete.additionals.legMinorMistake);

        aggregated.mistake.legMajorMistakes = results
            .map(athlete => athlete.additionals.legMajorMistake);

        {
            aggregated.mistake.legWithin1Percent = results
                .map(athlete => athlete.additionals.legWithin1Percent);

            aggregated.mistake.legWithin2Percent = results
                .map(athlete => athlete.additionals.legWithin2Percent);

            aggregated.mistake.legWithin4Percent = results
                .map(athlete => athlete.additionals.legWithin4Percent);

            aggregated.mistake.legWithin8Percent = results
                .map(athlete => athlete.additionals.legWithin8Percent);

            aggregated.mistake.legWithin16Percent = results
                .map(athlete => athlete.additionals.legWithin16Percent);

            aggregated.mistake.legWithin32Percent = results
                .map(athlete => athlete.additionals.legWithin32Percent);

            aggregated.mistake.legWithin64Percent = results
                .map(athlete => athlete.additionals.legWithin64Percent);

            aggregated.mistake.legWithin128Percent = results
                .map(athlete => athlete.additionals.legWithin128Percent);

            aggregated.mistake.legAbove128Percent = results
                .map(athlete => athlete.additionals.legAbove128Percent);
        }

        {
            aggregated.averagePercentageLoss = results
                .map(athlete => athlete.leg.averagePercentageLoss);

            aggregated.medianPercentageLoss = results
                .map(athlete => athlete.leg.medianPercentageLoss);
        }

        {
            const optimalTotalTimeInSeconds = sum(orienteeringData.best.leg.timesInSeconds);
            orienteeringData.best.optimalTotalTimeInSeconds = optimalTotalTimeInSeconds;
            orienteeringData.best.optimalTotalTime = formatTime(optimalTotalTimeInSeconds, 'minutes');
        }

        console.log('[Step 3] Enhancing data so it can be used together with charts - DONE');
    };

    console.log(`Initializing orienteering functionality - DONE (version ${version})`);

    return {
        version,
        parseSplitTimesExportedAsText,
        calculateActualAndRelativeTimesFromParsedInformation,
        enhanceOrienteeringDataForCharts,
        formatTime: formatTime
    }

})();